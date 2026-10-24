import path from "node:path";
import { eq } from "drizzle-orm";
import type { JobContext } from "../../worker/handlers";
import { folderFiles, watchedFolders } from "../db/schema";
import { PermanentJobError } from "../jobs/errors";
import { importLocalFile, LocalFileError, resolveFileInside, waitUntilStable } from "../media/local-file";
import { probeFile } from "../media/probe";

/** How long a recently modified file that isn't readable yet keeps being retried. */
export const SETTLE_GRACE_MS = 60_000;

/** Worker job "folder-import": validate one watched-folder file and copy it into the library. */
export async function importFolderFile({ db, job, progress, signal }: JobContext): Promise<void> {
  const { fileId } = JSON.parse(job.payloadJson) as { fileId: string };
  const row = db.select().from(folderFiles).where(eq(folderFiles.id, fileId)).get();
  if (!row) return; // folder was removed meanwhile
  const folder = db.select().from(watchedFolders).where(eq(watchedFolders.id, row.folderId)).get();
  if (!folder) return;
  const set = (patch: Partial<typeof folderFiles.$inferSelect>) => db.update(folderFiles).set(patch).where(eq(folderFiles.id, fileId)).run();

  try {
    if (path.isAbsolute(row.relPath) || row.relPath.split(path.sep).includes("..")) throw new LocalFileError("outside");
    const real = resolveFileInside(path.join(folder.path, row.relPath), folder.path);
    progress({ stage: "waiting-for-file", progress: 0.1 });
    const stat = await waitUntilStable(real, { intervalMs: 500, stableChecks: 2, signal });
    progress({ stage: "checking", progress: 0.2 });
    try {
      await probeFile(real, signal);
    } catch (err) {
      // A recorder may hold data back for a while before flushing; an unreadable
      // file that changed recently is re-checked later instead of rejected.
      if (err instanceof PermanentJobError && Date.now() - stat.mtimeMs < SETTLE_GRACE_MS) {
        set({ status: "pending", jobId: null, changedAt: Date.now(), sizeBytes: stat.size, mtimeMs: stat.mtimeMs });
        return;
      }
      throw err; // non-video / corrupt
    }
    progress({ stage: "copying", progress: 0.4 });
    const res = await importLocalFile(db, { real, stat, origin: "folder" });
    set({
      status: res.duplicate && !res.linked ? "duplicate" : "imported",
      recordingId: res.id,
      error: null,
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  } catch (err) {
    if (err instanceof LocalFileError) {
      if (err.problem === "missing") {
        set({ status: "pending", present: false, jobId: null }); // picked up again if it reappears
        return;
      }
      set({ status: "failed", error: err.problem === "outside" ? "This file isn’t inside the watched folder, so it was skipped." : "Unsupported file type." });
      throw new PermanentJobError(`folder file rejected: ${err.problem}`);
    }
    if (err instanceof PermanentJobError) {
      set({ status: "invalid", error: err.message });
      throw err;
    }
    if (job.attempts >= job.maxAttempts) set({ status: "failed", error: "Importing this file failed. Use Retry to try again." });
    throw err;
  }
}
