import "server-only";
import fs from "node:fs";
import { desc, eq, inArray } from "drizzle-orm";
import { connection } from "next/server";
import { formatLabel, type LibraryRecording } from "@/lib/recordings/types";
import { getDb } from "./db/client";
import { jobs, recordings } from "./db/schema";
import { managedPath } from "./media/storage";

type Row = typeof recordings.$inferSelect;

function latestJobs(ids: string[]) {
  if (!ids.length) return new Map<string, typeof jobs.$inferSelect>();
  const rows = getDb().select().from(jobs).where(inArray(jobs.recordingId, ids)).orderBy(desc(jobs.createdAt)).all();
  const out = new Map<string, typeof jobs.$inferSelect>();
  for (const j of rows) if (j.recordingId && !out.has(j.recordingId)) out.set(j.recordingId, j);
  return out;
}

function exists(rel: string | null): boolean {
  if (!rel) return false;
  try {
    return fs.statSync(managedPath(rel)).isFile();
  } catch {
    return false;
  }
}

function toView(r: Row, job: typeof jobs.$inferSelect | undefined): LibraryRecording {
  const ready = r.status === "ready" || r.status === "analyzed";
  const playable = r.proxyPath ?? r.originalPath;
  const mediaMissing = ready && !exists(playable);
  return {
    id: r.id,
    title: r.title,
    originalFilename: r.originalFilename,
    status: r.status,
    error: r.error,
    stage: r.status === "imported" ? "queued" : r.status === "processing" ? (job?.stage ?? "queued") : null,
    progress: r.status === "processing" ? (job?.progress ?? 0) : ready ? 1 : 0,
    durationMs: r.durationMs,
    width: r.width,
    height: r.height,
    fps: r.fps,
    sizeBytes: r.sizeBytes,
    format: formatLabel(r.container, r.originalFilename),
    videoCodec: r.videoCodec,
    audioCodec: r.audioCodec,
    recordedAt: r.recordedAt ?? r.importedAt,
    importedAt: r.importedAt,
    posterUrl: r.posterPath && exists(r.posterPath) ? `/api/media/${r.id}/poster` : null,
    videoUrl: ready && !mediaMissing ? `/api/media/${r.id}/video` : null,
    proxied: Boolean(r.proxyPath),
    mediaMissing,
    origin: r.origin,
    parentRecordingId: r.parentRecordingId,
    parentStartMs: r.parentStartMs,
  };
}

/** Reads without `connection()`: for route handlers (already request-time). */
export function readRecordings(ids?: string[]): LibraryRecording[] {
  const db = getDb();
  const rows = ids
    ? ids.length
      ? db.select().from(recordings).where(inArray(recordings.id, ids)).all()
      : []
    : db.select().from(recordings).orderBy(desc(recordings.importedAt)).all();
  const j = latestJobs(rows.map((r) => r.id));
  return rows.map((r) => toView(r, j.get(r.id)));
}

export async function listRecordings(): Promise<LibraryRecording[]> {
  await connection();
  return readRecordings();
}

export async function getRecording(id: string): Promise<LibraryRecording | null> {
  await connection();
  const r = getDb().select().from(recordings).where(eq(recordings.id, id)).get();
  return r ? toView(r, latestJobs([id]).get(id)) : null;
}
