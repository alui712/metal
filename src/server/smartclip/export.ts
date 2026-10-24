import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import type { JobContext } from "../../worker/handlers";
import { clipSuggestions, recordings } from "../db/schema";
import { PermanentJobError } from "../jobs/errors";
import { runFfmpeg } from "../media/ffmpeg";
import { incomingDir, managedPath } from "../media/storage";
import { receiveUpload } from "../media/upload";
import { clockLabel } from "./candidates";

/** Frame-accurate cut of [start, end) from the original, as a browser-safe MP4. */
export function clipArgs(input: string, output: string, startMs: number, endMs: number): string[] {
  return [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-ss", (startMs / 1000).toFixed(3),
    "-i", input,
    "-t", ((endMs - startMs) / 1000).toFixed(3),
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    output,
  ];
}

/**
 * Worker job "clip-export": renders an accepted suggestion as a real video
 * and adds it to the library (Phase 2 pipeline: hash, dedupe, ingest).
 */
export async function exportClip({ db, job, progress, signal }: JobContext): Promise<void> {
  const { suggestionId } = JSON.parse(job.payloadJson) as { suggestionId: string };
  const s = db.select().from(clipSuggestions).where(eq(clipSuggestions.id, suggestionId)).get();
  if (!s) return; // recording removed meanwhile
  const setS = (v: Partial<typeof clipSuggestions.$inferInsert>) => db.update(clipSuggestions).set(v).where(eq(clipSuggestions.id, suggestionId)).run();
  const parent = db.select().from(recordings).where(eq(recordings.id, s.recordingId)).get();
  fs.mkdirSync(incomingDir(), { recursive: true });
  const tmp = path.join(/*turbopackIgnore: true*/ incomingDir(), `${job.id}.mp4`);
  try {
    if (!parent) throw new PermanentJobError("The source recording no longer exists.");
    const input = managedPath(parent.originalPath);
    if (!fs.existsSync(input)) throw new PermanentJobError("The source video is missing from storage.");
    if (s.endMs <= s.startMs) throw new PermanentJobError("The clip has no length.");
    progress({ stage: "cutting", progress: 0.2 });
    await runFfmpeg(clipArgs(input, tmp, s.startMs, s.endMs), { signal, timeoutMs: Math.max(120_000, (s.endMs - s.startMs) * 10) });
    progress({ stage: "importing", progress: 0.8 });
    // Only a known parent time gives the clip a time; import time isn't one.
    const recordedAt = parent.recordedAt !== null ? parent.recordedAt + s.startMs : null;
    const res = await receiveUpload(db, {
      body: Readable.toWeb(fs.createReadStream(tmp)) as ReadableStream<Uint8Array>,
      filename: `${parent.title} – clip ${clockLabel(s.startMs).replace(/:/g, "-")}.mp4`,
      lastModified: recordedAt,
      origin: "clip",
      recordedAtSource: "parent",
    });
    db.update(recordings).set({ parentRecordingId: parent.id, parentStartMs: s.startMs }).where(eq(recordings.id, res.id)).run();
    setS({ saveStatus: "saved", savedRecordingId: res.id, saveError: null });
  } catch (err) {
    const permanent = err instanceof PermanentJobError;
    if (permanent || job.attempts >= job.maxAttempts) setS({ saveStatus: "failed", saveError: permanent ? (err as Error).message : "Saving the clip failed. Try again." });
    throw err;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
