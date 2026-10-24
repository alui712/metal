import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { JobContext } from "../../worker/handlers";
import { PermanentJobError } from "../jobs/errors";
import { isMediaExt } from "../media/storage";
import { receiveUpload } from "../media/upload";
import { writeCaptureState } from "./state";

export type ObsImportPayload = { path: string; kind: "replay" | "recording"; allowedDir: string | null };

/**
 * Checks a path reported by OBS before reading it: an absolute path to a
 * regular video file (not a symlink) that really sits inside OBS's
 * recording folder. Returns the resolved path.
 */
export function validateObsPath(file: unknown, allowedDir: string | null): string {
  if (typeof file !== "string" || !file || file.length > 4096 || !path.isAbsolute(file)) throw new PermanentJobError("OBS reported an invalid file path.");
  if (!allowedDir) throw new PermanentJobError("Couldn’t confirm OBS’s recording folder, so the file wasn’t imported.");
  if (!isMediaExt(path.extname(file).slice(1).toLowerCase())) {
    throw new PermanentJobError("OBS saved a format METAL can’t import. Use MKV, MP4, or MOV in OBS → Settings → Output.");
  }
  let real: string;
  let dir: string;
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile()) throw new Error("not a regular file");
    real = fs.realpathSync(file);
    dir = fs.realpathSync(allowedDir);
  } catch {
    throw new PermanentJobError("The file OBS saved couldn’t be found.");
  }
  if (!real.startsWith(dir + path.sep)) throw new PermanentJobError("The file isn’t inside OBS’s recording folder, so it wasn’t imported.");
  return real;
}

/** Resolves once size and mtime stop changing (the writer has finished). */
export async function waitUntilStable(
  file: string,
  { intervalMs = 500, stableChecks = 3, timeoutMs = 120_000, signal }: { intervalMs?: number; stableChecks?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<fs.Stats> {
  const end = Date.now() + timeoutMs;
  let last = "";
  let stable = 0;
  for (;;) {
    if (signal?.aborted) throw new Error("Aborted");
    const st = fs.statSync(file);
    const sig = `${st.size}:${st.mtimeMs}`;
    stable = st.size > 0 && sig === last ? stable + 1 : 0;
    last = sig;
    if (stable >= stableChecks) {
      // Must also be openable for reading.
      fs.closeSync(fs.openSync(file, "r"));
      return st;
    }
    if (Date.now() > end) throw new PermanentJobError("OBS was still writing the file after two minutes.");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Worker job "obs-import": copy a finished OBS file into the library via the Phase 2 pipeline. */
export async function importObsFile({ db, job, progress, signal }: JobContext): Promise<void> {
  const payload = JSON.parse(job.payloadJson) as ObsImportPayload;
  try {
    progress({ stage: "waiting-for-file", progress: 0.1 });
    const file = validateObsPath(payload.path, payload.allowedDir);
    const st = await waitUntilStable(file, { signal, timeoutMs: payload.kind === "recording" ? 300_000 : 120_000 });
    progress({ stage: "copying", progress: 0.4 });
    const { id, duplicate } = await receiveUpload(db, {
      body: Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>,
      filename: path.basename(file),
      lastModified: st.mtimeMs,
      origin: payload.kind === "replay" ? "obs-replay" : "obs-recording",
    });
    writeCaptureState(db, { lastClipStatus: duplicate ? "duplicate" : "imported", lastClipRecordingId: id, lastClipError: null });
  } catch (err) {
    console.error(`[obs-import ${job.id}]`, err instanceof Error ? err.message : err);
    writeCaptureState(db, {
      lastClipStatus: "failed",
      lastClipError: err instanceof PermanentJobError ? err.message : "Importing the saved file failed.",
    });
    throw err instanceof PermanentJobError ? err : new PermanentJobError("Importing the saved file failed.");
  }
}
