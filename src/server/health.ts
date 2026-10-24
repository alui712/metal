import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { count } from "drizzle-orm";
import { config, paths } from "./config";
import { getDb } from "./db/client";
import { recordings } from "./db/schema";
import { getLiveWorker } from "./jobs/queue";

const run = promisify(execFile);

export type CheckState = "ok" | "warn" | "error";

export type HealthCheck = {
  id: string;
  label: string;
  state: CheckState;
  detail: string;
  /** What the user can do to fix a failing check. */
  fix?: string;
  /** Features that degrade when this check fails. */
  affects: string[];
};

async function binaryVersion(bin: string, args: string[]) {
  try {
    const { stdout, stderr } = await run(bin, args, { timeout: 5000 });
    const first = `${stdout}${stderr}`.split("\n").find((l) => l.trim());
    return { ok: true as const, version: first?.trim() ?? "available" };
  } catch {
    return { ok: false as const };
  }
}

async function checkFfmpeg(): Promise<HealthCheck> {
  const [ffmpeg, ffprobe] = await Promise.all([
    binaryVersion(config.ffmpegPath, ["-hide_banner", "-version"]),
    binaryVersion(config.ffprobePath, ["-hide_banner", "-version"]),
  ]);
  const ok = ffmpeg.ok && ffprobe.ok;
  return {
    id: "ffmpeg",
    label: "FFmpeg",
    state: ok ? "ok" : "error",
    detail: ok
      ? ffmpeg.version.replace(/ Copyright.*$/, "")
      : `${[!ffmpeg.ok && "ffmpeg", !ffprobe.ok && "ffprobe"].filter(Boolean).join(" and ")} not found`,
    fix: ok ? undefined : "brew install ffmpeg",
    affects: ["Import", "Analysis", "Export"],
  };
}

async function checkWhisper(): Promise<HealthCheck> {
  const bin = await binaryVersion(config.whisperPath, ["--help"]);
  const model = await fs
    .stat(config.whisperModelPath)
    .then((s) => s.isFile())
    .catch(() => false);
  const state: CheckState = bin.ok && model ? "ok" : "warn";
  return {
    id: "whisper",
    label: "Transcription (whisper.cpp)",
    state,
    detail: !bin.ok
      ? "whisper-cli not found"
      : !model
        ? `Model missing at ${config.whisperModelPath}`
        : "Ready",
    fix: !bin.ok
      ? "brew install whisper-cpp"
      : !model
        ? "Download a ggml model into data/models/"
        : undefined,
    affects: ["Transcript search"],
  };
}

function checkAnthropic(): HealthCheck {
  const hasKey = Boolean(config.anthropicApiKey);
  return {
    id: "anthropic",
    label: "Claude (vision & story)",
    state: hasKey ? "ok" : "warn",
    detail: hasKey ? "API key configured" : "ANTHROPIC_API_KEY not set",
    fix: hasKey ? undefined : "Add ANTHROPIC_API_KEY to .env.local",
    affects: ["Visual analysis", "Titles & summaries", "Natural-language edits"],
  };
}

function checkCapture(): HealthCheck {
  // Honest placeholder until the OBS adapter exists; never reports a connection.
  return {
    id: "capture",
    label: "Capture (OBS)",
    state: "warn",
    detail: "Not connected — OBS integration arrives in Phase 4",
    fix: "Install OBS 28+ and enable its WebSocket server",
    affects: ["Recording", "Save clip", "Replay buffer"],
  };
}

async function checkStorage(): Promise<HealthCheck> {
  try {
    await fs.mkdir(paths.media, { recursive: true });
    await fs.access(config.dataDir, fs.constants.W_OK);
    const [{ n }] = getDb().select({ n: count() }).from(recordings).all();
    return {
      id: "storage",
      label: "Library storage",
      state: "ok",
      detail: `${n} recording${n === 1 ? "" : "s"} · ${config.dataDir}`,
      affects: ["Everything"],
    };
  } catch (err) {
    return {
      id: "storage",
      label: "Library storage",
      state: "error",
      detail: err instanceof Error ? err.message : String(err),
      affects: ["Everything"],
    };
  }
}

function checkWorker(): HealthCheck {
  const worker = (() => {
    try {
      return getLiveWorker(getDb());
    } catch {
      return undefined;
    }
  })();
  return {
    id: "worker",
    label: "Background worker",
    state: worker ? "ok" : "error",
    detail: worker
      ? `Online · pid ${worker.pid}${worker.currentJobId ? " · busy" : " · idle"}`
      : "Offline",
    fix: worker ? undefined : "npm run worker (or npm run dev:all)",
    affects: ["Import", "Analysis", "Export"],
  };
}

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const [storage, ffmpeg, whisper] = await Promise.all([
    checkStorage(),
    checkFfmpeg(),
    checkWhisper(),
  ]);
  return [storage, checkWorker(), checkCapture(), ffmpeg, whisper, checkAnthropic()];
}
