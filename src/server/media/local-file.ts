import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { PermanentJobError } from "../jobs/errors";
import { recordings } from "../db/schema";
import { isMediaExt } from "./storage";
import { receiveUpload, type UploadResult } from "./upload";

// Importing videos that already sit on this computer (OBS output, watched
// folders). The source is only ever read: opened read-only and streamed
// through the normal upload pipeline, never moved, renamed, or deleted.

export type LocalFileProblem = "invalid-path" | "format" | "missing" | "outside";

export class LocalFileError extends Error {
  constructor(readonly problem: LocalFileProblem) {
    super(problem);
  }
}

/**
 * Resolves `file` only if it is an absolute path to a regular video file
 * (not a symlink) whose real path is inside `root`'s real path.
 */
export function resolveFileInside(file: unknown, root: string): string {
  if (typeof file !== "string" || !file || file.length > 4096 || file.includes("\0") || !path.isAbsolute(file)) {
    throw new LocalFileError("invalid-path");
  }
  if (!isMediaExt(path.extname(file).slice(1).toLowerCase())) throw new LocalFileError("format");
  let real: string;
  let dir: string;
  try {
    if (!fs.lstatSync(file).isFile()) throw new Error("not a regular file");
    real = fs.realpathSync(file);
    dir = fs.realpathSync(root);
  } catch {
    throw new LocalFileError("missing");
  }
  if (!real.startsWith(dir + path.sep)) throw new LocalFileError("outside");
  return real;
}

/** A recording already copied from this exact source file (same path and size). */
export function findBySource(db: Db, real: string, size: number): string | null {
  return (
    db
      .select({ id: recordings.id })
      .from(recordings)
      .where(and(eq(recordings.sourcePath, real), eq(recordings.sizeBytes, size)))
      .get()?.id ?? null
  );
}

export type LocalImportResult = UploadResult & { linked: boolean };

/** Copies a validated local file into the library (or links an existing copy). */
export async function importLocalFile(
  db: Db,
  input: { real: string; stat: fs.Stats; origin: "obs-replay" | "obs-recording" | "folder" },
): Promise<LocalImportResult> {
  const existing = findBySource(db, input.real, input.stat.size);
  if (existing) return { id: existing, duplicate: true, linked: true };
  const result = await receiveUpload(db, {
    body: Readable.toWeb(fs.createReadStream(input.real, { flags: "r" })) as ReadableStream<Uint8Array>,
    filename: path.basename(input.real),
    lastModified: input.stat.mtimeMs,
    // OBS writes the file while recording, so its modified time is the capture time.
    recordedAtSource: input.origin === "folder" ? "file-date" : "capture",
    origin: input.origin,
    sourcePath: input.real,
  });
  return { ...result, linked: false };
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
    if (Date.now() > end) throw new PermanentJobError("The file was still being written, so it wasn’t imported yet.");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
