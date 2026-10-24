import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { captureState, folderFiles, watchedFolders } from "../db/schema";
import { config } from "../config";
import { newId } from "../ids";

// Watched folders: validation and client-safe views. Only folders the user
// explicitly added are ever read; this module never lists anything else.

export type FolderKind = (typeof watchedFolders.$inferSelect)["kind"];
export const FOLDER_KINDS = ["obs", "medal", "generic"] as const satisfies readonly FolderKind[];
export const KIND_LABEL: Record<FolderKind, string> = { obs: "OBS recordings", medal: "Medal clips", generic: "Recordings" };

/** Not watchable: the whole disk, system locations, account roots, app data. */
function blocked(real: string, home: string): boolean {
  const exact = ["/", home, path.dirname(home), "/Users", "/Volumes", "/private", "/private/var", "/private/tmp", "/tmp", "/var"];
  const under = ["/System", "/Library", "/usr", "/bin", "/sbin", "/etc", "/dev", "/cores", "/opt", "/Applications", "/private/etc", "/private/var/db", path.join(home, "Library")];
  if (exact.includes(real)) return true;
  if (under.some((p) => real === p || real.startsWith(p + path.sep))) return true;
  // Hidden folders (".ssh", ".config", …) anywhere in the path.
  return real.split(path.sep).some((seg) => seg.startsWith("."));
}

const within = (child: string, parent: string) => child === parent || child.startsWith(parent + path.sep);

export type FolderCheck = { ok: true; real: string } | { ok: false; error: string; denied?: boolean };

/** Validates a folder the user chose. Returns its real path. */
export function checkFolder(db: Db, input: unknown, { home = os.homedir() } = {}): FolderCheck {
  if (typeof input !== "string" || !input.trim() || input.length > 1024 || input.includes("\0")) return { ok: false, error: "Enter the folder’s full path." };
  let p = input.trim();
  if (p === "~" || p.startsWith("~/")) p = path.join(/*turbopackIgnore: true*/ home, p.slice(1));
  if (!path.isAbsolute(p)) return { ok: false, error: "Use the folder’s full path, starting with / or ~/." };
  let real: string;
  try {
    // User-chosen runtime path, not a bundled asset: exclude from output tracing.
    real = fs.realpathSync(/*turbopackIgnore: true*/ p);
    if (!fs.statSync(/*turbopackIgnore: true*/ real).isDirectory()) return { ok: false, error: "That’s a file, not a folder." };
  } catch {
    return { ok: false, error: "That folder doesn’t exist." };
  }
  const homeReal = safeReal(home);
  if (blocked(real, homeReal)) return { ok: false, error: "Choose a specific recordings folder — not a system, hidden, or top-level folder." };
  const data = safeReal(config.dataDir);
  if (within(real, data) || within(data, real)) return { ok: false, error: "That’s METAL’s own library storage (or a folder containing it). Choose the folder your recorder saves to." };
  for (const f of db.select({ path: watchedFolders.path, label: watchedFolders.label }).from(watchedFolders).all()) {
    if (within(real, f.path) || within(f.path, real)) return { ok: false, error: `That overlaps a folder you’re already watching (${f.label}).` };
  }
  try {
    fs.readdirSync(real);
  } catch (err) {
    return deniedOr(err);
  }
  return { ok: true, real };
}

function safeReal(p: string) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

export const DENIED_MESSAGE =
  "macOS isn’t letting METAL read this folder. Allow the app that runs METAL (Terminal, iTerm, or your editor) in System Settings → Privacy & Security → Files and Folders, then rescan.";

export function deniedOr(err: unknown): { ok: false; error: string; denied?: boolean } {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "EPERM" || code === "EACCES") return { ok: false, error: DENIED_MESSAGE, denied: true };
  return { ok: false, error: "METAL couldn’t read that folder." };
}

/** Home-relative display ("~/Movies/OBS"); the only form of the path sent to clients. */
export function displayPath(real: string, home = os.homedir()): string {
  const h = safeReal(home);
  return real === h ? "~" : real.startsWith(h + path.sep) ? `~${real.slice(h.length)}` : real;
}

export function addFolder(db: Db, input: { real: string; kind: FolderKind; label?: string }): string {
  const id = newId("fld");
  const label = (input.label?.trim() || KIND_LABEL[input.kind]).slice(0, 80);
  db.insert(watchedFolders).values({ id, kind: input.kind, label, path: input.real }).run();
  return id;
}

/** OBS's own recording folder, as last reported by the capture service. */
export function obsRecordDirectory(db: Db): string | null {
  return db.select({ dir: captureState.recordDirectory }).from(captureState).where(eq(captureState.id, 1)).get()?.dir ?? null;
}

export type FolderView = {
  id: string;
  kind: FolderKind;
  label: string;
  displayPath: string;
  status: "active" | "paused";
  state: (typeof watchedFolders.$inferSelect)["state"];
  error: string | null;
  lastScanAt: number | null;
  rescanPending: boolean;
  counts: { found: number; imported: number; processing: number; failed: number; invalid: number; missing: number };
  /** Recent problems, by file name only. */
  problems: Array<{ name: string; error: string }>;
  recentRecordingIds: string[];
};

export function listFolderViews(db: Db): FolderView[] {
  const folders = db.select().from(watchedFolders).orderBy(watchedFolders.createdAt).all();
  if (!folders.length) return [];
  const ids = folders.map((f) => f.id);
  const counts = db
    .select({ folderId: folderFiles.folderId, status: folderFiles.status, present: folderFiles.present, n: sql<number>`count(*)` })
    .from(folderFiles)
    .where(inArray(folderFiles.folderId, ids))
    .groupBy(folderFiles.folderId, folderFiles.status, folderFiles.present)
    .all();
  return folders.map((f) => {
    const c = { found: 0, imported: 0, processing: 0, failed: 0, invalid: 0, missing: 0 };
    for (const r of counts.filter((r) => r.folderId === f.id)) {
      if (!r.present) {
        c.missing += r.n;
        if (r.status === "imported" || r.status === "duplicate") c.imported += r.n;
        continue;
      }
      c.found += r.n;
      if (r.status === "imported" || r.status === "duplicate") c.imported += r.n;
      else if (r.status === "pending" || r.status === "importing") c.processing += r.n;
      else c[r.status] += r.n;
    }
    const problems = db
      .select({ relPath: folderFiles.relPath, error: folderFiles.error })
      .from(folderFiles)
      .where(and(eq(folderFiles.folderId, f.id), eq(folderFiles.present, true), inArray(folderFiles.status, ["failed", "invalid"])))
      .orderBy(desc(folderFiles.changedAt))
      .limit(5)
      .all()
      .map((p) => ({ name: path.basename(p.relPath), error: p.error ?? "Couldn’t be imported." }));
    const recent = db
      .select({ id: folderFiles.recordingId })
      .from(folderFiles)
      .where(and(eq(folderFiles.folderId, f.id), inArray(folderFiles.status, ["imported", "duplicate"])))
      .orderBy(desc(folderFiles.changedAt))
      .limit(4)
      .all()
      .flatMap((r) => (r.id ? [r.id] : []));
    return {
      id: f.id,
      kind: f.kind,
      label: f.label,
      displayPath: displayPath(f.path),
      status: f.status,
      state: f.status === "paused" ? "paused" : f.state,
      error: f.error,
      lastScanAt: f.lastScanAt,
      rescanPending: Boolean(f.rescanRequestedAt && (!f.lastScanAt || f.rescanRequestedAt > f.lastScanAt)),
      counts: c,
      problems,
      recentRecordingIds: [...new Set(recent)],
    };
  });
}

export type FolderAction = "pause" | "resume" | "rescan" | "retry";

export function updateFolder(db: Db, id: string, action: FolderAction): boolean {
  const folder = db.select({ id: watchedFolders.id }).from(watchedFolders).where(eq(watchedFolders.id, id)).get();
  if (!folder) return false;
  const now = Date.now();
  if (action === "pause") db.update(watchedFolders).set({ status: "paused" }).where(eq(watchedFolders.id, id)).run();
  if (action === "resume") db.update(watchedFolders).set({ status: "active", rescanRequestedAt: now }).where(eq(watchedFolders.id, id)).run();
  if (action === "rescan") db.update(watchedFolders).set({ rescanRequestedAt: now }).where(eq(watchedFolders.id, id)).run();
  if (action === "retry") {
    db.update(folderFiles)
      .set({ status: "pending", error: null, changedAt: now })
      .where(and(eq(folderFiles.folderId, id), inArray(folderFiles.status, ["failed", "invalid"])))
      .run();
    db.update(watchedFolders).set({ rescanRequestedAt: now }).where(eq(watchedFolders.id, id)).run();
  }
  return true;
}

/** Stops watching. Recordings already in the library stay; the folder itself is untouched. */
export function removeFolder(db: Db, id: string): boolean {
  return db.delete(watchedFolders).where(eq(watchedFolders.id, id)).run().changes > 0;
}
