import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import type { JobContext } from "../../worker/handlers";
import { config } from "../config";
import type { Db } from "../db/client";
import { audioEvents, frames, recordingAnalysis, recordings } from "../db/schema";
import { newId } from "../ids";
import { PermanentJobError } from "../jobs/errors";
import { enqueueJob } from "../jobs/queue";
import { runFfmpeg } from "../media/ffmpeg";
import { managedPath } from "../media/storage";
import { regenerateSuggestions } from "../smartclip/suggest";
import { detectAudioEvents, parseEbur128 } from "./audio";
import { speechProvider, visionProvider } from "./providers";
import { keyframeTimes, parseScdet } from "./visual";

const run = promisify(execFile);

/** Bump when signal extraction changes; analysis with an older version can be re-run. */
export const ANALYSIS_VERSION = "ffmpeg-1";

export const frameRel = (recordingId: string, tMs: number) => `${recordingId}/frames/${String(tMs).padStart(9, "0")}.jpg`;

/** Stream start offsets, so every timestamp is relative to the start of the file (what players show). */
export async function streamOffsets(file: string, signal?: AbortSignal) {
  const { stdout } = await run(config.ffprobePath, ["-v", "error", "-print_format", "json", "-show_entries", "format=start_time:stream=codec_type,start_time", file], {
    timeout: 60_000,
    signal,
  });
  const j = JSON.parse(stdout) as { format?: { start_time?: string }; streams?: Array<{ codec_type?: string; start_time?: string }> };
  const base = Number(j.format?.start_time ?? 0) || 0;
  const audio = j.streams?.find((s) => s.codec_type === "audio");
  return {
    hasAudio: Boolean(audio),
    audioOffsetMs: Math.round(((Number(audio?.start_time ?? base) || 0) - base) * 1000),
    videoStartMs: Math.round(base * 1000), // scdet reports pts time, which includes the file's start
  };
}

/** Collects stderr from an FFmpeg pass whose output is discarded. */
export function ffmpegLog(args: string[], { signal, timeoutMs }: { signal?: AbortSignal; timeoutMs: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(config.ffmpegPath, args, { signal, timeout: timeoutMs, maxBuffer: 256 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) reject(err);
      else resolve(String(stderr));
    });
  });
}

/**
 * Worker job "analyze": FFmpeg-only signals for one recording — loudness
 * events, scene changes, timestamped keyframes — then Smart Clip
 * suggestions. Idempotent: a re-run replaces this recording's signals.
 */
export async function analyzeRecording({ db, job, progress, signal }: JobContext): Promise<void> {
  const id = job.recordingId;
  if (!id) throw new PermanentJobError("Analysis job has no recording.");
  const rec = db.select().from(recordings).where(eq(recordings.id, id)).get();
  if (!rec) throw new PermanentJobError("Recording no longer exists.");
  const setA = (v: Partial<typeof recordingAnalysis.$inferInsert>) => db.update(recordingAnalysis).set(v).where(eq(recordingAnalysis.recordingId, id)).run();

  try {
    if (rec.status !== "ready" && rec.status !== "analyzed") throw new PermanentJobError("This recording isn’t ready yet — wait for it to finish processing.");
    const durationMs = rec.durationMs ?? 0;
    if (durationMs <= 0) throw new PermanentJobError("This recording has no duration to analyze.");
    const file = managedPath(rec.originalPath);
    if (!fs.existsSync(file)) throw new PermanentJobError("The video file is missing from storage.");
    setA({ status: "running", stage: "audio", error: null, jobId: job.id });
    const minutes = durationMs / 60_000;
    const timeoutMs = Math.max(120_000, Math.round(minutes * 60_000)); // generous: ≥ real time

    // ── Audio ─────────────────────────────────────────────
    progress({ stage: "audio", progress: 0.1 });
    const offsets = await streamOffsets(file, signal);
    let audio: ReturnType<typeof detectAudioEvents> = [];
    if (offsets.hasAudio) {
      const log = await ffmpegLog(["-hide_banner", "-nostdin", "-loglevel", "info", "-i", file, "-map", "0:a:0", "-vn", "-af", "ebur128", "-f", "null", "-"], { signal, timeoutMs });
      audio = detectAudioEvents(parseEbur128(log, offsets.audioOffsetMs), durationMs);
    }

    // ── Scene changes ─────────────────────────────────────
    progress({ stage: "scenes", progress: 0.4 });
    setA({ stage: "scenes" });
    const sceneLog = await ffmpegLog(
      ["-hide_banner", "-nostdin", "-loglevel", "info", "-i", file, "-map", "0:v:0", "-an", "-vf", "fps=10,scale=240:-2,scdet=threshold=10", "-f", "null", "-"],
      { signal, timeoutMs },
    );
    const scenes = parseScdet(sceneLog, offsets.videoStartMs).filter((s) => s.tMs <= durationMs);

    // ── Keyframes ─────────────────────────────────────────
    progress({ stage: "keyframes", progress: 0.7 });
    setA({ stage: "keyframes" });
    const picks = keyframeTimes(durationMs, scenes);
    const dir = managedPath(`${id}/frames`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const extracted: Array<{ tMs: number; rel: string; scene: (typeof picks)[number]["scene"] }> = [];
    for (const p of picks) {
      const rel = frameRel(id, p.tMs);
      await runFfmpeg(
        ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-ss", (p.tMs / 1000).toFixed(3), "-i", file, "-frames:v", "1", "-vf", "scale='min(480,iw)':-2", "-q:v", "4", managedPath(rel)],
        { signal, timeoutMs: 30_000 },
      );
      if (fs.existsSync(managedPath(rel))) extracted.push({ tMs: p.tMs, rel, scene: p.scene });
    }

    // ── Persist (replace this recording's signals) ────────
    progress({ stage: "suggestions", progress: 0.9 });
    setA({ stage: "suggestions" });
    db.$client.transaction(() => {
      db.delete(audioEvents).where(eq(audioEvents.recordingId, id)).run();
      db.delete(frames).where(eq(frames.recordingId, id)).run();
      for (const e of audio) {
        db.insert(audioEvents).values({ id: newId("aud"), recordingId: id, kind: e.kind, startMs: e.startMs, endMs: e.endMs, score: e.score, evidenceJson: JSON.stringify(e.evidence) }).run();
      }
      for (const sc of scenes) {
        db.insert(audioEvents).values({ id: newId("aud"), recordingId: id, kind: "scene_change", startMs: sc.tMs, endMs: sc.tMs, score: Math.min(1, sc.score / 100), evidenceJson: JSON.stringify({ scdetScore: sc.score }) }).run();
      }
      for (const f of extracted) {
        db.insert(frames).values({ id: newId("frm"), recordingId: id, tMs: f.tMs, path: f.rel, isSceneChange: Boolean(f.scene), sceneScore: f.scene?.score ?? null }).run();
      }
      regenerateSuggestions(db, id, durationMs, ANALYSIS_VERSION);
    })();

    const speech = speechProvider();
    const vision = visionProvider();
    setA({
      status: "done",
      stage: null,
      error: null,
      hasAudio: offsets.hasAudio,
      finishedAt: Date.now(),
      signalsJson: JSON.stringify({
        audio: offsets.hasAudio ? "ok" : "unavailable: This recording has no audio track.",
        scenes: "ok",
        // Speech comes from the separate transcribe job; the view reads its live status.
        speech: speech.available ? "unavailable: Not transcribed yet" : `unavailable: ${speech.reason}`,
        vision: `unavailable: ${vision.available ? "" : vision.reason}`,
      }),
    });
  } catch (err) {
    const permanent = err instanceof PermanentJobError;
    const final = permanent || job.attempts >= job.maxAttempts;
    if (!(err instanceof Error && err.name === "AbortError")) {
      setA(final ? { status: "failed", stage: null, error: permanent ? (err as Error).message : "Analysis failed. Try again.", finishedAt: Date.now() } : { status: "queued", stage: null });
    }
    if (!permanent) console.error(`[analyze ${job.id}]`, err instanceof Error ? err.message : err);
    throw err;
  }
}

/** Queues analysis unless one is already queued or running. */
export function requestAnalysis(db: Db, recordingId: string): "queued" | "busy" {
  const cur = db.select().from(recordingAnalysis).where(eq(recordingAnalysis.recordingId, recordingId)).get();
  if (cur && (cur.status === "queued" || cur.status === "running")) return "busy";
  const values = { version: ANALYSIS_VERSION, status: "queued" as const, stage: null, error: null, requestedAt: Date.now(), finishedAt: null };
  db.$client.transaction(() => {
    const job = enqueueJob(db, { kind: "analyze", recordingId, maxAttempts: 2 });
    db.insert(recordingAnalysis)
      .values({ recordingId, ...values, jobId: job.id })
      .onConflictDoUpdate({ target: recordingAnalysis.recordingId, set: { ...values, jobId: job.id } })
      .run();
  })();
  return "queued";
}
