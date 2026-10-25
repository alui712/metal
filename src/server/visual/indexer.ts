import fs from "node:fs";
import { eq } from "drizzle-orm";
import type { JobContext } from "../../worker/handlers";
import { streamOffsets, ffmpegLog } from "../analysis/analyze";
import type { Db } from "../db/client";
import { recordings, recordingVisualIndex, visualFrames } from "../db/schema";
import { newId } from "../ids";
import { PermanentJobError } from "../jobs/errors";
import { enqueueJob } from "../jobs/queue";
import { managedPath } from "../media/storage";
import { toBlob } from "../search/embed";
import { embedImageFile, visualModelStatus } from "./clip";

// Worker job "visual-index" (ADR 0022): one FFmpeg pass samples a frame every
// `intervalMs` plus frames just after hard cuts, with exact timestamps from
// showinfo; each frame is embedded locally with CLIP. Opt-in per recording.
// Re-indexing replaces only this recording's visual frames; the video itself
// is only ever read.

/** Bump when sampling or embedding changes; recordings indexed with an older version can be re-run. */
export const VISUAL_INDEX_VERSION = "clip-frames-1";

export const VISUAL_SAMPLING = {
  /** Regular sample spacing — short enough that a ~3 s scene gets at least one frame. */
  baseIntervalMs: 2000,
  /** Beyond this many regular samples the spacing grows (≈ 1 h at 2 s). */
  maxRegularFrames: 1800,
  /** FFmpeg `scene` score (0–1) that counts as a hard cut worth an extra frame. */
  sceneThreshold: 0.4,
  /** …but never two frames closer than this. */
  minGapMs: 750,
  /** Frame height: CLIP sees a 224 px center crop; the same file is the preview. */
  height: 224,
};

export const samplingInterval = (durationMs: number) => Math.max(VISUAL_SAMPLING.baseIntervalMs, Math.ceil(durationMs / VISUAL_SAMPLING.maxRegularFrames / 500) * 500);

export function samplingFilter(intervalMs: number): string {
  const s = VISUAL_SAMPLING;
  const i = (intervalMs / 1000).toFixed(3);
  const g = (s.minGapMs / 1000).toFixed(3);
  // Commas inside the select expression are escaped for the filtergraph parser.
  return `scale=-2:${s.height},select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${i})+gt(scene\\,${s.sceneThreshold})*gte(t-prev_selected_t\\,${g})',showinfo`;
}

/** Pure: frame times (ms, file-relative) from FFmpeg showinfo output, in output order. */
export function parseShowinfo(stderr: string, videoStartMs = 0): number[] {
  const out: number[] = [];
  for (const m of stderr.matchAll(/Parsed_showinfo[^\n]*?\bn:\s*\d+\s+pts:\s*-?\d+\s+pts_time:\s*(-?[\d.]+)/g)) {
    const t = Number(m[1]);
    if (Number.isFinite(t)) out.push(Math.max(0, Math.round(t * 1000) - videoStartMs));
  }
  return out;
}

const relDir = (id: string) => `${id}/visual`;
export const visualFrameRel = (id: string, tMs: number) => `${relDir(id)}/${String(tMs).padStart(9, "0")}.jpg`;

export async function indexRecordingVisuals({ db, job, progress, signal }: JobContext): Promise<void> {
  const id = job.recordingId;
  if (!id) throw new PermanentJobError("Visual index job has no recording.");
  const rec = db.select().from(recordings).where(eq(recordings.id, id)).get();
  if (!rec) throw new PermanentJobError("Recording no longer exists.");
  const setV = (v: Partial<typeof recordingVisualIndex.$inferInsert>) => db.update(recordingVisualIndex).set(v).where(eq(recordingVisualIndex.recordingId, id)).run();
  const tmpRel = `${relDir(id)}.tmp`;
  try {
    if (rec.status !== "ready" && rec.status !== "analyzed") throw new PermanentJobError("This recording isn’t ready yet — wait for it to finish processing.");
    const durationMs = rec.durationMs ?? 0;
    if (durationMs <= 0) throw new PermanentJobError("This recording has no duration to index.");
    const model = visualModelStatus();
    if (!model.available) throw new PermanentJobError(model.reason);
    const file = managedPath(rec.originalPath);
    if (!fs.existsSync(file)) throw new PermanentJobError("The video file is missing from storage.");

    // ── Frames (one decode pass, exact pts) ───────────────
    setV({ status: "running", stage: "frames", error: null, jobId: job.id });
    progress({ stage: "frames", progress: 0.05 });
    const t0 = Date.now();
    const intervalMs = samplingInterval(durationMs);
    const tmp = managedPath(tmpRel);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    const { videoStartMs } = await streamOffsets(file, signal);
    const log = await ffmpegLog(
      ["-hide_banner", "-nostdin", "-loglevel", "info", "-i", file, "-map", "0:v:0", "-an", "-vf", samplingFilter(intervalMs), "-fps_mode", "vfr", "-q:v", "5", `${tmp}/%06d.jpg`],
      { signal, timeoutMs: Math.max(120_000, durationMs * 2) },
    );
    const times = parseShowinfo(log, videoStartMs);
    const files = fs.readdirSync(tmp).filter((f) => f.endsWith(".jpg")).sort();
    if (!files.length) throw new PermanentJobError("FFmpeg extracted no frames from this video.");
    if (files.length !== times.length) throw new Error(`Frame/timestamp mismatch (${files.length} files, ${times.length} times).`);
    const extractMs = Date.now() - t0;

    // ── Embeddings ────────────────────────────────────────
    setV({ stage: "embedding", extractMs });
    const t1 = Date.now();
    const rows: Array<typeof visualFrames.$inferInsert> = [];
    const seen = new Set<number>();
    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      const tMs = Math.min(times[i], durationMs);
      if (seen.has(tMs)) continue; // the unique (recording, t) index; duplicate pts are the same picture
      seen.add(tMs);
      const v = await embedImageFile(`${tmp}/${files[i]}`);
      const gap = i ? tMs - times[i - 1] : intervalMs;
      fs.renameSync(`${tmp}/${files[i]}`, `${tmp}/${String(tMs).padStart(9, "0")}.jpg`);
      rows.push({ id: newId("vfr"), recordingId: id, tMs, path: visualFrameRel(id, tMs), isSceneChange: gap < intervalMs * 0.9, model: model.model, embedding: toBlob(v) });
      if (i % 10 === 0) progress({ stage: "embedding", progress: 0.1 + 0.85 * (i / files.length) });
    }
    const embedMs = Date.now() - t1;

    // ── Persist (swap the frame folder, replace rows) ─────
    const dir = managedPath(relDir(id));
    fs.rmSync(dir, { recursive: true, force: true });
    for (const f of fs.readdirSync(tmp)) if (!/^\d{9}\.jpg$/.test(f)) fs.rmSync(`${tmp}/${f}`);
    fs.renameSync(tmp, dir);
    db.$client.transaction(() => {
      db.delete(visualFrames).where(eq(visualFrames.recordingId, id)).run();
      for (const r of rows) db.insert(visualFrames).values(r).run();
      setV({ status: "done", stage: null, error: null, version: VISUAL_INDEX_VERSION, model: model.model, intervalMs, frameCount: rows.length, extractMs, embedMs, finishedAt: Date.now() });
    })();
  } catch (err) {
    fs.rmSync(managedPath(tmpRel), { recursive: true, force: true });
    const permanent = err instanceof PermanentJobError;
    const final = permanent || job.attempts >= job.maxAttempts;
    if (!(err instanceof Error && err.name === "AbortError")) {
      setV(final ? { status: "failed", stage: null, error: permanent ? (err as Error).message : "Visual indexing failed. Try again.", finishedAt: Date.now() } : { status: "queued", stage: null });
    }
    if (!permanent) console.error(`[visual-index ${job.id}]`, err instanceof Error ? err.message : err);
    throw err;
  }
}

/**
 * Queues visual indexing (explicit user action only). Skips work already
 * done: "busy" while queued/running, "current" when this recording is
 * already indexed with the current version and model (unless forced).
 */
export function requestVisualIndex(db: Db, recordingId: string, { force = false } = {}): "queued" | "busy" | "current" {
  const cur = db.select().from(recordingVisualIndex).where(eq(recordingVisualIndex.recordingId, recordingId)).get();
  if (cur && (cur.status === "queued" || cur.status === "running")) return "busy";
  const model = currentModel();
  if (!force && cur?.status === "done" && cur.version === VISUAL_INDEX_VERSION && cur.model === model) return "current";
  const values = { status: "queued" as const, stage: null, error: null, version: VISUAL_INDEX_VERSION, model, requestedAt: Date.now(), finishedAt: null };
  db.$client.transaction(() => {
    const job = enqueueJob(db, { kind: "visual-index", recordingId, maxAttempts: 2 });
    db.insert(recordingVisualIndex)
      .values({ recordingId, ...values, jobId: job.id })
      .onConflictDoUpdate({ target: recordingVisualIndex.recordingId, set: { ...values, jobId: job.id } })
      .run();
  })();
  return "queued";
}

const currentModel = () => {
  const s = visualModelStatus();
  return s.available ? s.model : "unavailable";
};

export type VisualIndexView = {
  status: "none" | "queued" | "running" | "done" | "failed";
  stage: string | null;
  error: string | null;
  frameCount: number | null;
  intervalMs: number | null;
  model: string | null;
  /** True when the stored index was built with an older version or model. */
  outdated: boolean;
  timing: { extractMs: number | null; embedMs: number | null };
  finishedAt: number | null;
  setup: { available: boolean; reason: string | null };
};

export function visualIndexView(db: Db, recordingId: string): VisualIndexView {
  const s = visualModelStatus();
  const r = db.select().from(recordingVisualIndex).where(eq(recordingVisualIndex.recordingId, recordingId)).get();
  return {
    status: r?.status ?? "none",
    stage: r?.stage ?? null,
    error: r?.error ?? null,
    frameCount: r?.frameCount ?? null,
    intervalMs: r?.intervalMs ?? null,
    model: r?.model ?? null,
    outdated: Boolean(r?.status === "done" && (r.version !== VISUAL_INDEX_VERSION || (s.available && r.model !== s.model))),
    timing: { extractMs: r?.extractMs ?? null, embedMs: r?.embedMs ?? null },
    finishedAt: r?.finishedAt ?? null,
    setup: s.available ? { available: true, reason: null } : { available: false, reason: s.reason },
  };
}
