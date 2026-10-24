import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { captureState, folderFiles, jobs, watchedFolders } from "../db/schema";
import { newId } from "../ids";
import { enqueueJob } from "../jobs/queue";
import { findBySource } from "../media/local-file";
import { isMediaExt } from "../media/storage";
import { DENIED_MESSAGE } from "./folders";

// Runs inside the worker. Keeps folder_files in step with each watched
// folder: periodic scans (which also catch files added while METAL was
// off) plus fs.watch wake-ups, then queues a folder-import job for each
// new video once it has stopped changing. Read-only on the folders.

/** A file must be unchanged this long before it's considered complete. */
export const STABLE_MS = 4000;
const IDLE_SCAN_MS = 15_000;
const BUSY_SCAN_MS = 2000;
const WATCH_DEBOUNCE_MS = 800;
const MAX_DEPTH = 4;
const MAX_FILES = 20_000;

type Folder = typeof watchedFolders.$inferSelect;
type Found = { rel: string; size: number; mtimeMs: number };

export class ScanError extends Error {
  constructor(readonly state: "unavailable" | "denied", message: string) {
    super(message);
  }
}

/** Lists video files under `root` (real path). Skips symlinks, hidden entries, and anything deeper than MAX_DEPTH. */
export async function walkFolder(root: string): Promise<Found[]> {
  try {
    if (!(await fs.promises.stat(root)).isDirectory()) throw new ScanError("unavailable", "This path is no longer a folder.");
  } catch (err) {
    if (err instanceof ScanError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES") throw new ScanError("denied", DENIED_MESSAGE);
    throw new ScanError("unavailable", "Folder not found — it may have been moved or renamed, or its drive is disconnected.");
  }
  const out: Found[] = [];
  async function walk(dir: string, depth: number) {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (dir === root && (code === "EPERM" || code === "EACCES")) throw new ScanError("denied", DENIED_MESSAGE);
      return; // an unreadable subfolder is skipped, not fatal
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES || e.name.startsWith(".") || e.isSymbolicLink()) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < MAX_DEPTH) await walk(abs, depth + 1);
      } else if (e.isFile() && isMediaExt(path.extname(e.name).slice(1).toLowerCase())) {
        try {
          const st = await fs.promises.lstat(abs);
          if (st.isFile()) out.push({ rel: path.relative(root, abs), size: st.size, mtimeMs: st.mtimeMs });
        } catch {
          /* vanished mid-scan */
        }
      }
    }
  }
  await walk(root, 0);
  return out;
}

export class FolderSync {
  private watchers = new Map<string, { path: string; watcher: fs.FSWatcher }>();
  private dirtyAt = new Map<string, number>();
  private nextScanAt = new Map<string, number>();
  private busy = false;

  constructor(
    private db: Db,
    private opts: { log?: (m: string) => void; watch?: boolean } = {},
  ) {}

  /** One pass: scans every folder that's due. Never throws. */
  async tick(now = Date.now()): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const folders = this.db.select().from(watchedFolders).all();
      for (const id of this.watchers.keys()) if (!folders.some((f) => f.id === id && f.status === "active")) this.unwatch(id);
      for (const f of folders) {
        if (f.status === "paused") {
          if (f.state !== "paused") this.setFolder(f.id, { state: "paused", error: null });
          continue;
        }
        const requested = Boolean(f.rescanRequestedAt && (!f.lastScanAt || f.rescanRequestedAt > f.lastScanAt));
        const dirty = this.dirtyAt.get(f.id);
        const due = requested || f.lastScanAt === null || (dirty !== undefined && now - dirty >= WATCH_DEBOUNCE_MS) || now >= (this.nextScanAt.get(f.id) ?? 0);
        if (due) await this.scan(f, Date.now(), requested || f.lastScanAt === null);
      }
    } catch (err) {
      this.opts.log?.(`folder sync error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.busy = false;
    }
  }

  private setFolder(id: string, patch: Partial<Folder>) {
    this.db.update(watchedFolders).set(patch).where(eq(watchedFolders.id, id)).run();
  }

  async scan(f: Folder, now = Date.now(), visible = false): Promise<void> {
    this.dirtyAt.delete(f.id);
    if (visible) this.setFolder(f.id, { state: "scanning" });
    let found: Found[];
    try {
      found = await walkFolder(f.path);
    } catch (err) {
      const e = err instanceof ScanError ? err : new ScanError("unavailable", "METAL couldn’t read this folder.");
      this.unwatch(f.id);
      // Keep file records as they are: a disconnected drive isn't a deletion.
      this.setFolder(f.id, { state: e.state, error: e.message, lastScanAt: now });
      this.nextScanAt.set(f.id, now + IDLE_SCAN_MS);
      return;
    }
    this.ensureWatcher(f);
    const busy = this.reconcile(f, found, now);
    this.setFolder(f.id, { state: "watching", error: null, lastScanAt: now });
    this.nextScanAt.set(f.id, now + (busy ? BUSY_SCAN_MS : IDLE_SCAN_MS));
  }

  /** Applies a scan to folder_files and queues complete files. Returns true while files are still settling. */
  reconcile(f: Folder, found: Found[], now: number): boolean {
    const db = this.db;
    let busy = false;
    db.$client.transaction(() => {
      const rows = db.select().from(folderFiles).where(eq(folderFiles.folderId, f.id)).all();
      const byPath = new Map(rows.map((r) => [r.relPath, r]));
      const foundPaths = new Set(found.map((x) => x.rel));
      // Rows that disappeared in this scan are rename candidates for new paths.
      const gone = rows.filter((r) => !foundPaths.has(r.relPath));
      for (const x of found) {
        const row = byPath.get(x.rel);
        if (row) {
          const changed = row.sizeBytes !== x.size || row.mtimeMs !== x.mtimeMs;
          if (changed) {
            const reprocess = row.status !== "pending" && row.status !== "importing";
            db.update(folderFiles)
              .set({ sizeBytes: x.size, mtimeMs: x.mtimeMs, changedAt: now, present: true, ...(reprocess ? { status: "pending", error: null, recordingId: null } : {}) })
              .where(eq(folderFiles.id, row.id))
              .run();
          } else if (!row.present) {
            db.update(folderFiles).set({ present: true }).where(eq(folderFiles.id, row.id)).run();
          }
          continue;
        }
        const i = gone.findIndex((r) => r.sizeBytes === x.size && r.mtimeMs === x.mtimeMs);
        if (i >= 0) {
          // Renamed or moved within the folder: same file, keep its state.
          db.update(folderFiles).set({ relPath: x.rel, present: true }).where(eq(folderFiles.id, gone[i].id)).run();
          gone.splice(i, 1);
          continue;
        }
        db.insert(folderFiles).values({ id: newId("ffl"), folderId: f.id, relPath: x.rel, sizeBytes: x.size, mtimeMs: x.mtimeMs, changedAt: now }).run();
      }
      for (const r of gone) if (r.present) db.update(folderFiles).set({ present: false }).where(eq(folderFiles.id, r.id)).run();

      // Imports that were interrupted (job gone or failed without the handler recording why).
      const importing = db.select().from(folderFiles).where(and(eq(folderFiles.folderId, f.id), eq(folderFiles.status, "importing"))).all();
      for (const r of importing) {
        const job = r.jobId ? db.select({ status: jobs.status, error: jobs.error }).from(jobs).where(eq(jobs.id, r.jobId)).get() : undefined;
        if (!job) db.update(folderFiles).set({ status: "pending", jobId: null }).where(eq(folderFiles.id, r.id)).run();
        else if (job.status === "failed" || job.status === "succeeded")
          db.update(folderFiles).set({ status: "failed", error: "The import was interrupted. Use Retry to try again." }).where(eq(folderFiles.id, r.id)).run();
        else busy = true;
      }

      const pending = db.select().from(folderFiles).where(and(eq(folderFiles.folderId, f.id), eq(folderFiles.status, "pending"), eq(folderFiles.present, true))).all();
      const obsBusy = this.obsWriting(f, now);
      const obsQueued = this.obsImportsInFlight();
      for (const r of pending) {
        busy = true;
        if (now - r.changedAt < STABLE_MS || now - r.mtimeMs < STABLE_MS) continue; // still being written
        if (obsBusy && r.mtimeMs >= obsBusy) continue; // OBS may be writing it (e.g. a paused recording)
        const abs = path.join(f.path, r.relPath);
        if (obsQueued.has(abs)) continue; // Phase 3 auto-import will bring it in; link afterwards
        const existing = findBySource(db, abs, r.sizeBytes);
        if (existing) {
          db.update(folderFiles).set({ status: "imported", recordingId: existing, error: null }).where(eq(folderFiles.id, r.id)).run();
          continue;
        }
        const job = enqueueJob(db, { kind: "folder-import", payload: { fileId: r.id }, maxAttempts: 2 });
        db.update(folderFiles).set({ status: "importing", jobId: job.id, error: null }).where(eq(folderFiles.id, r.id)).run();
      }
    })();
    return busy;
  }

  /** While OBS records into this folder, files modified since the recording began may still be open. */
  private obsWriting(f: Folder, now: number): number | null {
    const s = this.db.select().from(captureState).where(eq(captureState.id, 1)).get();
    if (!s || s.connection !== "connected" || !s.recording || !s.recordDirectory || now - s.updatedAt > 5000) return null;
    let dir: string;
    try {
      dir = fs.realpathSync(s.recordDirectory);
    } catch {
      return null;
    }
    if (dir !== f.path && !dir.startsWith(f.path + path.sep)) return null;
    return now - s.recordDurationMs - 5000;
  }

  private obsImportsInFlight(): Set<string> {
    const out = new Set<string>();
    const rows = this.db.select({ payload: jobs.payloadJson }).from(jobs).where(and(eq(jobs.kind, "obs-import"), inArray(jobs.status, ["queued", "running"]))).all();
    for (const r of rows) {
      try {
        out.add(fs.realpathSync(JSON.parse(r.payload).path));
      } catch {
        /* file gone; nothing to defer */
      }
    }
    return out;
  }

  private ensureWatcher(f: Folder) {
    if (this.opts.watch === false) return;
    const cur = this.watchers.get(f.id);
    if (cur?.path === f.path) return;
    this.unwatch(f.id);
    try {
      const watcher = fs.watch(f.path, { recursive: true, persistent: false }, () => {
        if (!this.dirtyAt.has(f.id)) this.dirtyAt.set(f.id, Date.now());
      });
      watcher.on("error", () => {
        this.unwatch(f.id);
        this.dirtyAt.set(f.id, Date.now()); // rescan to learn what happened
      });
      this.watchers.set(f.id, { path: f.path, watcher });
    } catch {
      /* periodic scans still cover it */
    }
  }

  private unwatch(id: string) {
    this.watchers.get(id)?.watcher.close();
    this.watchers.delete(id);
  }

  close() {
    for (const id of [...this.watchers.keys()]) this.unwatch(id);
  }
}
