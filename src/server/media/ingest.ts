import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { JobContext } from "../../worker/handlers";
import { recordings } from "../db/schema";
import { resolveRecordedAt } from "./recorded-time";
import { PermanentJobError } from "../jobs/errors";
import { posterArgs, proxyArgs, runFfmpeg } from "./ffmpeg";
import { needsProxy, probeFile } from "./probe";
import { managedPath, mediaRel } from "./storage";

/**
 * Worker job "ingest": probe → poster → (proxy if the browser can't play
 * the original) → ready. Messages stored on the recording are user-facing
 * and never include paths; raw tool output goes to the worker log.
 */
export async function ingestRecording({ db, job, progress, signal }: JobContext): Promise<void> {
  const id = job.recordingId;
  if (!id) throw new PermanentJobError("Ingest job has no recording.");
  const rec = db.select().from(recordings).where(eq(recordings.id, id)).get();
  if (!rec) throw new PermanentJobError("Recording no longer exists.");

  const setRec = (values: Partial<typeof recordings.$inferInsert>) =>
    db.update(recordings).set(values).where(eq(recordings.id, id)).run();

  try {
    setRec({ status: "processing", error: null });
    const original = managedPath(rec.originalPath);
    if (!fs.existsSync(original)) throw new PermanentJobError("The uploaded file is missing from storage.");
    const ext = path.extname(original).slice(1);

    progress({ stage: "probing", progress: 0.05 });
    const info = await probeFile(original, signal);
    setRec({
      durationMs: info.durationMs,
      width: info.width,
      height: info.height,
      fps: info.fps,
      container: info.container,
      videoCodec: info.videoCodec,
      audioCodec: info.audioCodec,
      ...(() => {
        const t = resolveRecordedAt({ filename: rec.originalFilename, durationMs: info.durationMs, metadataMs: info.createdAt, current: { at: rec.recordedAt, source: rec.recordedAtSource } });
        return { recordedAt: t.at, recordedAtSource: t.source };
      })(),
    });

    progress({ stage: "thumbnail", progress: 0.15 });
    const posterRel = mediaRel.poster(id);
    const at = Math.min(Math.max(info.durationMs / 1000 * 0.1, 0), Math.max(info.durationMs / 1000 - 0.5, 0));
    try {
      await runFfmpeg(posterArgs(original, managedPath(posterRel), at), { signal, timeoutMs: 60_000 });
    } catch {
      // Some files can't seek; fall back to the first frame.
      await runFfmpeg(posterArgs(original, managedPath(posterRel), 0), { signal, timeoutMs: 60_000 });
    }
    setRec({ posterPath: posterRel });

    if (needsProxy(info, ext)) {
      progress({ stage: "transcoding", progress: 0.2 });
      const proxyRel = mediaRel.proxy(id);
      const tmp = `${managedPath(proxyRel)}.part.mp4`;
      await runFfmpeg(proxyArgs(original, tmp), {
        signal,
        onProgressMs: (ms) => progress({ progress: 0.2 + 0.78 * Math.min(1, ms / info.durationMs) }),
      });
      fs.renameSync(tmp, managedPath(proxyRel));
      setRec({ proxyPath: proxyRel });
    }

    setRec({ status: "ready", error: null });
    progress({ stage: "ready", progress: 1 });
  } catch (err) {
    console.error(`[ingest ${id}]`, err);
    const permanent = err instanceof PermanentJobError;
    const final = permanent || job.attempts >= job.maxAttempts;
    setRec(
      final
        ? { status: "failed", error: permanent ? err.message : "Processing failed. Check that FFmpeg is installed and try importing again." }
        : { status: "processing", error: null },
    );
    throw err;
  }
}
