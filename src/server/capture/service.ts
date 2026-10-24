import { REPLAY_OPTIONS } from "../../lib/capture/settings";
import type { Db } from "../db/client";
import { enqueueJob } from "../jobs/queue";
import { isLoopback, obsUrl, readObsConfig, type ObsConfig } from "./config";
import type { ObsImportPayload } from "./import";
import { ObsAuthError, ObsClient, ObsRequestError } from "./obs-client";
import { finishCommand, takePendingCommands, writeCaptureState, type CaptureAction, type StatePatch } from "./state";

// Runs inside the worker. Owns the single OBS connection: connects from the
// saved config, reconnects with backoff, mirrors OBS state into
// capture_state, executes UI commands, and queues imports when OBS reports
// a saved replay or a finished recording (however it was triggered).

const MAX_BACKOFF_MS = 15_000;
const SAVE_CONFIRM_MS = 15_000;

type Deps = {
  createClient?: () => ObsClient;
  readConfig?: () => ObsConfig | null;
  log?: (message: string) => void;
};

export class CaptureService {
  private client: ObsClient | null = null;
  private connecting = false;
  private configKey: string | null = null;
  private authFailed = false;
  private retryAt = 0;
  private backoff = 1000;
  private lastRefresh = 0;
  private recordDir: string | null = null;
  private host = "";
  private saveWaiters = new Set<(path: string) => void>();
  private busy = false;
  private readonly createClient: () => ObsClient;
  private readonly readConfig: () => ObsConfig | null;
  private readonly log: (message: string) => void;

  constructor(
    private db: Db,
    deps: Deps = {},
  ) {
    this.createClient = deps.createClient ?? (() => new ObsClient());
    this.readConfig = deps.readConfig ?? readObsConfig;
    this.log = deps.log ?? (() => {});
  }

  private set(patch: StatePatch) {
    writeCaptureState(this.db, patch);
  }

  /** One pass of the service loop. Never throws. */
  async tick(now = Date.now()): Promise<void> {
    if (this.busy) {
      this.set({}); // heartbeat only
      return;
    }
    this.busy = true;
    try {
      const cfg = this.readConfig();
      const key = cfg?.enabled ? JSON.stringify([cfg.host, cfg.port, cfg.password]) : null;
      if (key !== this.configKey) {
        this.disconnect();
        this.configKey = key;
        this.authFailed = false;
        this.backoff = 1000;
        this.retryAt = 0;
        this.set({ connection: key ? "connecting" : "disabled", error: null, obsVersion: null, recording: false, replayActive: false, replayAvailable: false });
      }
      if (cfg?.enabled && !this.client && !this.connecting && !this.authFailed && now >= this.retryAt) await this.connect(cfg);
      if (this.client?.connected && now - this.lastRefresh >= 1000) await this.refresh();
      await this.processCommands();
      this.set({});
    } catch (err) {
      this.log(`capture tick error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.busy = false;
    }
  }

  private async connect(cfg: ObsConfig) {
    this.connecting = true;
    this.set({ connection: "connecting" });
    const client = this.createClient();
    try {
      await client.connect(obsUrl(cfg), cfg.password);
      this.client = client;
      this.host = cfg.host;
      this.backoff = 1000;
      const version = await client.request<{ obsVersion?: string }>("GetVersion");
      this.subscribe(client);
      this.set({ connection: "connected", error: null, obsVersion: version.obsVersion ?? null });
      this.log(`connected to OBS ${version.obsVersion ?? ""}`);
      await this.refresh();
    } catch (err) {
      client.close();
      this.client = null;
      if (err instanceof ObsAuthError) {
        this.authFailed = true; // don't hammer OBS with a wrong password
        this.set({ connection: "error", error: `${err.message} Check the password in Sources.` });
      } else {
        this.retryAt = Date.now() + this.backoff;
        this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
        this.set({ connection: "error", error: err instanceof Error ? err.message : "Couldn’t connect to OBS." });
      }
    } finally {
      this.connecting = false;
    }
  }

  private subscribe(client: ObsClient) {
    client.onClose(() => {
      if (this.client !== client) return;
      this.client = null;
      this.retryAt = Date.now() + 1000;
      this.set({ connection: "error", error: "Lost connection to OBS — reconnecting…", recording: false, replayActive: false });
      this.log("OBS disconnected");
    });
    client.on("RecordStateChanged", (d) => {
      const active = Boolean(d.outputActive);
      this.set({ recording: active, ...(active ? {} : { recordDurationMs: 0 }) });
      if (d.outputState === "OBS_WEBSOCKET_OUTPUT_STOPPED" && typeof d.outputPath === "string") this.queueImport(d.outputPath, "recording");
    });
    client.on("ReplayBufferStateChanged", (d) => this.set({ replayActive: Boolean(d.outputActive) }));
    client.on("ReplayBufferSaved", (d) => {
      const saved = typeof d.savedReplayPath === "string" ? d.savedReplayPath : null;
      if (!saved) return;
      for (const w of this.saveWaiters) w(saved);
      this.queueImport(saved, "replay");
    });
    client.on("ExitStarted", () => this.set({ connection: "error", error: "OBS is closing." }));
    client.on("CurrentProfileChanged", () => void this.refresh());
  }

  private queueImport(file: string, kind: "replay" | "recording") {
    if (!isLoopback(this.host)) {
      this.set({ lastClipStatus: "failed", lastClipKind: kind, lastClipAt: Date.now(), lastClipRecordingId: null, lastClipError: "OBS is on another computer, so its files can’t be imported automatically." });
      return;
    }
    const payload: ObsImportPayload = { path: file, kind, allowedDir: this.recordDir };
    enqueueJob(this.db, { kind: "obs-import", payload, maxAttempts: 1 });
    this.set({ lastClipStatus: "importing", lastClipKind: kind, lastClipAt: Date.now(), lastClipRecordingId: null, lastClipError: null });
    this.log(`queued import of OBS ${kind}`);
  }

  /** Mirrors OBS's real state. Missing features (no replay buffer configured) read as unavailable. */
  private async refresh() {
    const client = this.client;
    if (!client?.connected) return;
    this.lastRefresh = Date.now();
    const rec = await client.request<{ outputActive: boolean; outputDuration: number }>("GetRecordStatus");
    let replayAvailable = true;
    let replayActive = false;
    try {
      replayActive = (await client.request<{ outputActive: boolean }>("GetReplayBufferStatus")).outputActive;
    } catch (err) {
      if (!(err instanceof ObsRequestError)) throw err;
      replayAvailable = false; // e.g. 604 "replay buffer not enabled"
    }
    const dir = await client.request<{ recordDirectory: string }>("GetRecordDirectory").catch(() => null);
    this.recordDir = dir?.recordDirectory ?? null;
    this.set({
      recording: rec.outputActive,
      recordDurationMs: rec.outputActive ? Math.round(rec.outputDuration) : 0,
      replayActive,
      replayAvailable,
      replaySeconds: await this.readReplaySeconds(),
      recordDirectory: this.recordDir,
    });
  }

  private async replayParam(): Promise<{ category: string; name: string }> {
    const mode = await this.client!.request<{ parameterValue: string | null }>("GetProfileParameter", { parameterCategory: "Output", parameterName: "Mode" });
    return { category: mode.parameterValue === "Advanced" ? "AdvOut" : "SimpleOutput", name: "RecRBTime" };
  }

  private async readReplaySeconds(): Promise<number | null> {
    try {
      const p = await this.replayParam();
      const v = await this.client!.request<{ parameterValue: string | null; defaultParameterValue: string | null }>("GetProfileParameter", {
        parameterCategory: p.category,
        parameterName: p.name,
      });
      const n = Number(v.parameterValue ?? v.defaultParameterValue);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }

  private async processCommands() {
    for (const cmd of takePendingCommands(this.db)) {
      try {
        const result = await this.run(cmd.action as CaptureAction, JSON.parse(cmd.payloadJson));
        finishCommand(this.db, cmd.id, { result });
      } catch (err) {
        finishCommand(this.db, cmd.id, { error: err instanceof Error ? err.message : "OBS couldn’t do that." });
      }
    }
  }

  private async run(action: CaptureAction, payload: { replaySeconds?: unknown }): Promise<Record<string, unknown>> {
    const client = this.client;
    if (!client?.connected) throw new Error("METAL isn’t connected to OBS.");
    switch (action) {
      case "start-record":
        await client.request("StartRecord");
        break;
      case "stop-record":
        await client.request("StopRecord");
        break;
      case "start-replay": {
        const seconds = Number(payload.replaySeconds);
        // RecRBTime is read when the buffer starts, so it's only safe to change while it's stopped.
        if ((REPLAY_OPTIONS as readonly number[]).includes(seconds)) {
          const status = await client.request<{ outputActive: boolean }>("GetReplayBufferStatus");
          if (!status.outputActive) {
            const p = await this.replayParam();
            await client.request("SetProfileParameter", { parameterCategory: p.category, parameterName: p.name, parameterValue: String(seconds) });
          }
        }
        await client.request("StartReplayBuffer");
        break;
      }
      case "stop-replay":
        await client.request("StopReplayBuffer");
        break;
      case "save-replay": {
        // Only report success once OBS says the file was written.
        const saved = new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.saveWaiters.delete(done);
            reject(new Error("OBS didn’t confirm the clip was saved."));
          }, SAVE_CONFIRM_MS);
          const done = (p: string) => {
            clearTimeout(timer);
            this.saveWaiters.delete(done);
            resolve(p);
          };
          this.saveWaiters.add(done);
        });
        try {
          await client.request("SaveReplayBuffer");
        } catch (err) {
          for (const w of [...this.saveWaiters]) this.saveWaiters.delete(w);
          throw err;
        }
        this.set({ lastClipStatus: "saving", lastClipKind: "replay", lastClipAt: Date.now(), lastClipRecordingId: null, lastClipError: null });
        await saved;
        await this.refresh();
        return { saved: true };
      }
    }
    await this.refresh();
    return {};
  }

  disconnect() {
    this.client?.close();
    this.client = null;
  }
}
