// Client-safe view of a real (imported) recording. Never includes file paths.

export type RecordingStatus = "imported" | "processing" | "ready" | "analyzed" | "failed";

export type LibraryRecording = {
  id: string;
  title: string;
  originalFilename: string;
  status: RecordingStatus;
  error: string | null;
  /** Latest ingest job stage/progress while processing. */
  stage: string | null;
  progress: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  sizeBytes: number | null;
  format: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  /** Recording time, or the import time when unknown (see `recordedAtSource`). */
  recordedAt: number;
  /** null: the recording time is unknown and `recordedAt` is the import time. */
  recordedAtSource: "filename" | "metadata" | "capture" | "file-date" | "parent" | "manual" | null;
  importedAt: number;
  posterUrl: string | null;
  videoUrl: string | null;
  /** Playback uses a converted copy because the browser can't play the original. */
  proxied: boolean;
  /** The database points at a file that's no longer in storage. */
  mediaMissing: boolean;
  origin: "upload" | "obs-replay" | "obs-recording" | "folder" | "clip";
  /** Saved Smart Clips: the recording it was cut from, and where. */
  parentRecordingId: string | null;
  parentStartMs: number | null;
};

export const STAGE_LABEL: Record<string, string> = {
  queued: "Waiting for the worker",
  probing: "Reading video details",
  thumbnail: "Making a thumbnail",
  transcoding: "Converting to a playable copy",
  ready: "Ready",
};

/** Human container name from ffprobe's format list. */
export function formatLabel(container: string | null, filename: string): string | null {
  const ext = filename.split(".").pop()?.toUpperCase() ?? "";
  if (!container) return ext || null;
  if (container.includes("matroska")) return ext === "WEBM" ? "WebM" : "MKV";
  if (container.includes("mp4") || container.includes("mov")) return ext === "MOV" ? "MOV" : "MP4";
  return ext || container;
}
