import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { recordings } from "../db/schema";
import { newId } from "../ids";
import { enqueueJob } from "../jobs/queue";
import { EXPECTED_FAMILY, sniffContainer } from "./sniff";
import { incomingDir, isMediaExt, managedPath, mediaRel, type MediaExt } from "./storage";

export const MAX_UPLOAD_BYTES = 20 * 1024 ** 3;

export class UploadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type UploadResult = { id: string; duplicate: boolean };

/** Display title from an untrusted filename: basename, no extension, bounded length. */
export function titleFromFilename(filename: string): string {
  const base = path.basename(filename.replace(/\\/g, "/"));
  const stem = base.replace(/\.[^.]+$/, "");
  const clean = stem.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[_]+/g, " ").trim();
  return (clean || "Untitled recording").slice(0, 120);
}

/**
 * Streams an untrusted upload into managed storage, hashing as it goes.
 * Rejects non-video bytes before storing, enforces the size limit while
 * streaming, dedupes by content hash, then queues the ingest job.
 */
export async function receiveUpload(
  db: Db,
  input: {
    body: ReadableStream<Uint8Array>;
    filename: string;
    lastModified?: number | null;
    origin?: "upload" | "obs-replay" | "obs-recording" | "folder" | "clip";
    /** Real path of a local source file (server-only). */
    sourcePath?: string;
    /** What `lastModified` is: a file's modified date (default), OBS's capture time, or a clip's parent time. */
    recordedAtSource?: "file-date" | "capture" | "parent";
  },
): Promise<UploadResult> {
  const ext = path.extname(input.filename).slice(1).toLowerCase();
  if (!isMediaExt(ext)) throw new UploadError(415, "Unsupported file type. Use MP4, MOV, WebM, or MKV.");

  fs.mkdirSync(incomingDir(), { recursive: true });
  const id = newId("rec");
  // Runtime data path, not a bundled asset: exclude from output tracing.
  const tmp = path.join(/*turbopackIgnore: true*/ incomingDir(), `${id}.${ext}`);
  const hash = createHash("sha256");
  const out = fs.createWriteStream(tmp, { flags: "wx" });
  let size = 0;
  let head: Uint8Array = new Uint8Array(0);
  let sniffed = false;

  try {
    const reader = input.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new UploadError(413, "File is larger than the 20 GB limit.");
      }
      if (!sniffed) {
        head = concat(head, value);
        if (head.length >= 12) {
          const family = sniffContainer(head);
          if (family !== EXPECTED_FAMILY[ext]) {
            await reader.cancel();
            throw new UploadError(415, family ? `This file’s contents don’t match its .${ext} extension.` : "This file isn’t a video.");
          }
          sniffed = true;
        }
      }
      hash.update(value);
      if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
    if (size === 0) throw new UploadError(400, "File is empty.");
    if (!sniffed) throw new UploadError(415, "This file isn’t a video.");

    const contentHash = hash.digest("hex");
    const existing = db.select({ id: recordings.id }).from(recordings).where(eq(recordings.contentHash, contentHash)).get();
    if (existing) {
      fs.rmSync(tmp, { force: true });
      // Remember where it came from, so the same file isn't copied again.
      if (input.sourcePath) {
        db.update(recordings)
          .set({ sourcePath: input.sourcePath })
          .where(and(eq(recordings.id, existing.id), isNull(recordings.sourcePath)))
          .run();
      }
      return { id: existing.id, duplicate: true };
    }

    const rel = mediaRel.original(id, ext as MediaExt);
    const dest = managedPath(rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(tmp, dest);
    const lm = input.lastModified;
    try {
      db.$client.transaction(() => {
        db.insert(recordings)
          .values({
            id,
            title: titleFromFilename(input.filename),
            originalFilename: path.basename(input.filename.replace(/\\/g, "/")).slice(0, 255),
            originalPath: rel,
            sizeBytes: size,
            contentHash,
            recordedAt: lm && lm > Date.UTC(2000, 0, 1) && lm < Date.now() + 86_400_000 ? lm : null,
            recordedAtSource: lm && lm > Date.UTC(2000, 0, 1) && lm < Date.now() + 86_400_000 ? (input.recordedAtSource ?? "file-date") : null,
            status: "imported",
            origin: input.origin ?? "upload",
            sourcePath: input.sourcePath ?? null,
          })
          .run();
        enqueueJob(db, { kind: "ingest", recordingId: id, maxAttempts: 2 });
      })();
    } catch (err) {
      fs.rmSync(path.dirname(dest), { recursive: true, force: true });
      // Same file uploaded concurrently: the other request won.
      const raced = db.select({ id: recordings.id }).from(recordings).where(eq(recordings.contentHash, contentHash)).get();
      if (raced) return { id: raced.id, duplicate: true };
      throw err;
    }
    return { id, duplicate: false };
  } catch (err) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
