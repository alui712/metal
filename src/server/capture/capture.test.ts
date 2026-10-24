import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client";
import { captureState, jobs } from "../db/schema";
import { PermanentJobError } from "../jobs/errors";
import { authResponse, ObsAuthError, ObsClient, ObsRequestError, type SocketLike } from "./obs-client";
import { isLoopback, validateObsInput } from "./config";
import { validateObsPath, waitUntilStable } from "./import";
import { CaptureService } from "./service";
import { awaitCommand, captureView, enqueueCommand, takePendingCommands, writeCaptureState } from "./state";

// ── A fake obs-websocket v5 server behind the SocketLike interface ──────

type Handler = (data: Record<string, unknown>) => { ok: true; data?: Record<string, unknown> } | { ok: false; code: number; comment: string };

class FakeObs {
  password: string | null = "hunter2";
  salt = "c2FsdA==";
  challenge = "Y2hhbGxlbmdl";
  handlers: Record<string, Handler> = {};
  requests: Array<{ type: string; data?: Record<string, unknown> }> = [];
  sockets: FakeSocket[] = [];
  reachable = true;
  factory = () => {
    const s = new FakeSocket(this);
    this.sockets.push(s);
    return s;
  };
  emit(eventType: string, eventData: Record<string, unknown>) {
    for (const s of this.sockets) if (s.open) s.deliver({ op: 5, d: { eventType, eventIntent: 64, eventData } });
  }
  dropAll() {
    for (const s of this.sockets) s.serverClose(1001);
  }
}

class FakeSocket implements SocketLike {
  onopen: SocketLike["onopen"] = null;
  onmessage: SocketLike["onmessage"] = null;
  onclose: SocketLike["onclose"] = null;
  onerror: SocketLike["onerror"] = null;
  open = false;
  constructor(private obs: FakeObs) {
    queueMicrotask(() => {
      if (!obs.reachable) {
        this.onerror?.({});
        this.onclose?.({ code: 1006, reason: "" });
        return;
      }
      this.open = true;
      this.deliver({
        op: 0,
        d: { obsWebSocketVersion: "5.6.0", rpcVersion: 1, ...(obs.password ? { authentication: { challenge: obs.challenge, salt: obs.salt } } : {}) },
      });
    });
  }
  deliver(msg: unknown) {
    queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(msg) }));
  }
  serverClose(code: number) {
    if (!this.open) return;
    this.open = false;
    queueMicrotask(() => this.onclose?.({ code, reason: "" }));
  }
  send(raw: string) {
    const msg = JSON.parse(raw) as { op: number; d: Record<string, unknown> };
    if (msg.op === 1) {
      const expected = this.obs.password ? authResponse(this.obs.password, this.obs.salt, this.obs.challenge) : undefined;
      if (expected && msg.d.authentication !== expected) return this.serverClose(4009);
      this.deliver({ op: 2, d: { negotiatedRpcVersion: 1 } });
    } else if (msg.op === 6) {
      const type = String(msg.d.requestType);
      this.obs.requests.push({ type, data: msg.d.requestData as Record<string, unknown> | undefined });
      const res = this.obs.handlers[type]?.((msg.d.requestData as Record<string, unknown>) ?? {}) ?? { ok: true as const, data: {} };
      this.deliver({
        op: 7,
        d: {
          requestType: type,
          requestId: msg.d.requestId,
          requestStatus: res.ok ? { result: true, code: 100 } : { result: false, code: res.code, comment: res.comment },
          responseData: res.ok ? res.data : undefined,
        },
      });
    }
  }
  close() {
    this.serverClose(1000);
  }
}

const flush = () => new Promise((r) => setTimeout(r, 5));

describe("obs-websocket client", () => {
  it("computes the v5 auth string", () => {
    // base64(sha256(base64(sha256("supersecretpassword" + salt)) + challenge)) — reference values from the protocol docs.
    expect(authResponse("supersecretpassword", "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=", "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=")).toBe(
      "1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=",
    );
  });

  it("authenticates, sends requests, and receives events", async () => {
    const obs = new FakeObs();
    obs.handlers.GetVersion = () => ({ ok: true, data: { obsVersion: "32.1.1" } });
    const c = new ObsClient(obs.factory);
    await c.connect("ws://127.0.0.1:4455", "hunter2");
    expect(c.connected).toBe(true);
    expect(await c.request("GetVersion")).toEqual({ obsVersion: "32.1.1" });
    const seen: unknown[] = [];
    c.on("ReplayBufferSaved", (d) => seen.push(d));
    obs.emit("ReplayBufferSaved", { savedReplayPath: "/x/Replay.mkv" });
    await flush();
    expect(seen).toEqual([{ savedReplayPath: "/x/Replay.mkv" }]);
  });

  it("rejects a wrong or missing password", async () => {
    const obs = new FakeObs();
    await expect(new ObsClient(obs.factory).connect("ws://127.0.0.1:4455", "wrong")).rejects.toBeInstanceOf(ObsAuthError);
    await expect(new ObsClient(obs.factory).connect("ws://127.0.0.1:4455", null)).rejects.toThrow(/requires a password/);
  });

  it("reports unreachable OBS and failed requests", async () => {
    const obs = new FakeObs();
    obs.reachable = false;
    await expect(new ObsClient(obs.factory).connect("ws://127.0.0.1:4455", "hunter2")).rejects.toThrow(/Couldn’t reach OBS/);
    obs.reachable = true;
    obs.handlers.StartReplayBuffer = () => ({ ok: false, code: 604, comment: "Replay buffer is not available." });
    const c = new ObsClient(obs.factory);
    await c.connect("ws://127.0.0.1:4455", "hunter2");
    await expect(c.request("StartReplayBuffer")).rejects.toMatchObject({ code: 604, message: "Replay buffer is not available." });
    await expect(c.request("StartReplayBuffer")).rejects.toBeInstanceOf(ObsRequestError);
  });
});

describe("OBS config validation", () => {
  it("accepts localhost forms and rejects bad input", () => {
    expect(isLoopback("127.0.0.1") && isLoopback("localhost") && isLoopback("::1") && isLoopback("[::1]")).toBe(true);
    expect(isLoopback("192.168.1.5") || isLoopback("evil.com")).toBe(false);
    expect(validateObsInput({ host: "127.0.0.1", port: 4455 })).toMatchObject({ ok: true, password: undefined });
    expect(validateObsInput({ host: "127.0.0.1; rm -rf /", port: 4455 }).ok).toBe(false);
    expect(validateObsInput({ host: "127.0.0.1", port: 70000 }).ok).toBe(false);
    expect(validateObsInput({ host: "127.0.0.1", port: 4455, password: "" })).toMatchObject({ ok: true, password: null });
  });
});

// ── Service against the fake OBS ──────────────────────────────

describe("CaptureService", () => {
  let db: Db;
  let obs: FakeObs;
  let cfg: { host: string; port: number; password: string | null; enabled: boolean } | null;
  let svc: CaptureService;
  const tick = async () => {
    await svc.tick();
    await flush();
  };
  const fresh = () => (svc = new CaptureService(db, { createClient: () => new ObsClient(obs.factory), readConfig: () => cfg }));

  beforeEach(() => {
    db = openDb(":memory:");
    // A live worker row so the view reports workerOnline.
    db.$client.prepare("INSERT INTO workers (id, pid, started_at, heartbeat_at) VALUES ('w', 1, ?, ?)").run(Date.now(), Date.now());
    obs = new FakeObs();
    let recording = false;
    let replay = false;
    obs.handlers = {
      GetVersion: () => ({ ok: true, data: { obsVersion: "32.1.1" } }),
      GetRecordStatus: () => ({ ok: true, data: { outputActive: recording, outputDuration: recording ? 4200 : 0 } }),
      GetReplayBufferStatus: () => ({ ok: true, data: { outputActive: replay } }),
      GetRecordDirectory: () => ({ ok: true, data: { recordDirectory: "/Users/me/Movies" } }),
      GetProfileParameter: (d) => ({ ok: true, data: { parameterValue: d.parameterName === "Mode" ? "Simple" : "20", defaultParameterValue: null } }),
      StartRecord: () => ((recording = true), { ok: true }),
      StopRecord: () => ((recording = false), { ok: true, data: { outputPath: "/Users/me/Movies/rec.mkv" } }),
      StartReplayBuffer: () => ((replay = true), { ok: true }),
      StopReplayBuffer: () => ((replay = false), { ok: true }),
      SaveReplayBuffer: () => {
        setTimeout(() => obs.emit("ReplayBufferSaved", { savedReplayPath: "/Users/me/Movies/Replay 1.mkv" }), 20);
        return { ok: true };
      },
    };
    cfg = { host: "127.0.0.1", port: 4455, password: "hunter2", enabled: true };
    fresh();
  });

  it("stays disabled without config", async () => {
    cfg = null;
    await tick();
    expect(db.select().from(captureState).get()?.connection).toBe("disabled");
  });

  it("connects and mirrors OBS state", async () => {
    await tick();
    const row = db.select().from(captureState).get()!;
    expect(row).toMatchObject({ connection: "connected", obsVersion: "32.1.1", recording: false, replayAvailable: true, replaySeconds: 20 });
  });

  it("stops retrying after an auth failure until the config changes", async () => {
    cfg!.password = "wrong";
    await tick();
    expect(db.select().from(captureState).get()).toMatchObject({ connection: "error" });
    expect(db.select().from(captureState).get()?.error).toMatch(/password/);
    const attempts = obs.sockets.length;
    await tick();
    expect(obs.sockets.length).toBe(attempts);
    cfg = { ...cfg!, password: "hunter2" };
    await tick();
    expect(db.select().from(captureState).get()?.connection).toBe("connected");
  });

  it("runs commands: record, replay with duration, and confirmed save", async () => {
    await tick();
    const start = enqueueCommand(db, "start-record");
    await tick();
    expect((await awaitCommand(db, start, 500)).status).toBe("done");
    expect(db.select().from(captureState).get()?.recording).toBe(true);

    const replay = enqueueCommand(db, "start-replay", { replaySeconds: 60 });
    await tick();
    expect((await awaitCommand(db, replay, 500)).status).toBe("done");
    expect(obs.requests.find((r) => r.type === "SetProfileParameter")?.data).toEqual({ parameterCategory: "SimpleOutput", parameterName: "RecRBTime", parameterValue: "60" });

    const save = enqueueCommand(db, "save-replay");
    await tick();
    expect(await awaitCommand(db, save, 500)).toEqual({ status: "done", result: { saved: true } });
    const imports = db.select().from(jobs).all().filter((j) => j.kind === "obs-import");
    expect(imports).toHaveLength(1);
    expect(JSON.parse(imports[0].payloadJson)).toEqual({ path: "/Users/me/Movies/Replay 1.mkv", kind: "replay", allowedDir: "/Users/me/Movies" });
  });

  it("imports clips saved with OBS's own hotkey and finished recordings", async () => {
    await tick();
    obs.emit("ReplayBufferSaved", { savedReplayPath: "/Users/me/Movies/Replay 2.mkv" });
    obs.emit("RecordStateChanged", { outputActive: false, outputState: "OBS_WEBSOCKET_OUTPUT_STOPPED", outputPath: "/Users/me/Movies/rec.mkv" });
    await flush();
    const kinds = db.select().from(jobs).all().map((j) => JSON.parse(j.payloadJson).kind);
    expect(kinds).toEqual(["replay", "recording"]);
    expect(db.select().from(captureState).get()?.lastClipStatus).toBe("importing");
  });

  it("fails save cleanly when OBS refuses", async () => {
    obs.handlers.SaveReplayBuffer = () => ({ ok: false, code: 501, comment: "Replay buffer is not active." });
    await tick();
    const save = enqueueCommand(db, "save-replay");
    await tick();
    expect(await awaitCommand(db, save, 500)).toEqual({ status: "failed", error: "Replay buffer is not active." });
    expect(db.select().from(jobs).all()).toHaveLength(0);
  });

  it("reconnects after OBS drops the connection", async () => {
    await tick();
    obs.dropAll();
    await flush();
    expect(db.select().from(captureState).get()).toMatchObject({ connection: "error" });
    await new Promise((r) => setTimeout(r, 1050));
    await tick();
    expect(db.select().from(captureState).get()?.connection).toBe("connected");
  });

  it("drops stale commands instead of running them late", () => {
    const id = enqueueCommand(db, "start-record");
    db.$client.prepare("UPDATE capture_commands SET created_at = ? WHERE id = ?").run(Date.now() - 60_000, id);
    expect(takePendingCommands(db)).toHaveLength(0);
  });

  it("view hides state when the worker is gone and never exposes the password", () => {
    writeCaptureState(db, { connection: "connected", recording: true }, Date.now() - 60_000);
    const view = captureView(db);
    expect(view.recording).toBe(false);
    expect(JSON.stringify(view)).not.toContain("hunter2");
  });
});

// ── Saved-file checks ───────────────────────────────────────

describe("OBS file import guards", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-obs-"));
  const rec = path.join(dir, "rec");
  fs.mkdirSync(rec);
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("accepts a video inside the recording folder only", () => {
    const ok = path.join(rec, "Replay.mkv");
    fs.writeFileSync(ok, "x");
    expect(validateObsPath(ok, rec)).toBe(fs.realpathSync(ok));
    const outside = path.join(dir, "elsewhere.mkv");
    fs.writeFileSync(outside, "x");
    expect(() => validateObsPath(outside, rec)).toThrow(PermanentJobError);
    expect(() => validateObsPath(path.join(rec, "..", "elsewhere.mkv"), rec)).toThrow(/inside OBS’s recording folder/);
    const link = path.join(rec, "link.mkv");
    fs.symlinkSync(outside, link);
    expect(() => validateObsPath(link, rec)).toThrow(PermanentJobError);
    fs.writeFileSync(path.join(rec, "notes.txt"), "x");
    expect(() => validateObsPath(path.join(rec, "notes.txt"), rec)).toThrow(/format/);
    expect(() => validateObsPath("relative.mkv", rec)).toThrow(/invalid/);
    expect(() => validateObsPath(ok, null)).toThrow(/recording folder/);
  });

  it("waits until a file stops growing", async () => {
    const f = path.join(rec, "growing.mkv");
    fs.writeFileSync(f, "a");
    let writes = 0;
    const t = setInterval(() => (writes++ < 4 ? fs.appendFileSync(f, "more") : clearInterval(t)), 30);
    const st = await waitUntilStable(f, { intervalMs: 40, stableChecks: 3, timeoutMs: 3000 });
    expect(st.size).toBe(fs.statSync(f).size);
    expect(writes).toBeGreaterThanOrEqual(4);
  });
});
