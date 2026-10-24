import path from "node:path";
import type { JobContext } from "../../worker/handlers";
import { PermanentJobError } from "../jobs/errors";
import { importLocalFile, waitUntilStable, LocalFileError, resolveFileInside, type LocalFileProblem } from "../media/local-file";
import { writeCaptureState } from "./state";

export { waitUntilStable };

export type ObsImportPayload = { path: string; kind: "replay" | "recording"; allowedDir: string | null };

const OBS_PATH_MESSAGES: Record<LocalFileProblem, string> = {
  "invalid-path": "OBS reported an invalid file path.",
  format: "OBS saved a format METAL can’t import. Use MKV, MP4, or MOV in OBS → Settings → Output.",
  missing: "The file OBS saved couldn’t be found.",
  outside: "The file isn’t inside OBS’s recording folder, so it wasn’t imported.",
};

/**
 * Checks a path reported by OBS before reading it: an absolute path to a
 * regular video file (not a symlink) that really sits inside OBS's
 * recording folder. Returns the resolved path.
 */
export function validateObsPath(file: unknown, allowedDir: string | null): string {
  if (typeof file !== "string" || !file || !path.isAbsolute(file)) throw new PermanentJobError(OBS_PATH_MESSAGES["invalid-path"]);
  if (!allowedDir) throw new PermanentJobError("Couldn’t confirm OBS’s recording folder, so the file wasn’t imported.");
  try {
    return resolveFileInside(file, allowedDir);
  } catch (err) {
    if (err instanceof LocalFileError) throw new PermanentJobError(OBS_PATH_MESSAGES[err.problem]);
    throw err;
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
    const { id, duplicate, linked } = await importLocalFile(db, { real: file, stat: st, origin: payload.kind === "replay" ? "obs-replay" : "obs-recording" });
    // `linked`: a watched folder already imported this exact file — it's this clip, not an old duplicate.
    writeCaptureState(db, { lastClipStatus: duplicate && !linked ? "duplicate" : "imported", lastClipRecordingId: id, lastClipError: null });
  } catch (err) {
    console.error(`[obs-import ${job.id}]`, err instanceof Error ? err.message : err);
    writeCaptureState(db, {
      lastClipStatus: "failed",
      lastClipError: err instanceof PermanentJobError ? err.message : "Importing the saved file failed.",
    });
    throw err instanceof PermanentJobError ? err : new PermanentJobError("Importing the saved file failed.");
  }
}
