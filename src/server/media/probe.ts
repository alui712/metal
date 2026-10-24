import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config";
import { PermanentJobError } from "../jobs/errors";

const run = promisify(execFile);

export type MediaInfo = {
  durationMs: number;
  width: number;
  height: number;
  fps: number | null;
  container: string;
  videoCodec: string;
  audioCodec: string | null;
  pixFmt: string | null;
  /** Creation time embedded by the recorder, if any. */
  createdAt: number | null;
};

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  duration?: string;
  disposition?: { attached_pic?: number };
};
type ProbeJson = {
  streams?: ProbeStream[];
  format?: { format_name?: string; duration?: string; tags?: Record<string, string> };
};

function rate(r: string | undefined): number | null {
  if (!r) return null;
  const [n, d] = r.split("/").map(Number);
  const v = d ? n / d : n;
  return Number.isFinite(v) && v > 0 && v < 1000 ? Math.round(v * 100) / 100 : null;
}

const UNREADABLE = "This file isn’t a readable video — it may be corrupt, incomplete, or not a video at all.";

/** Pure: ffprobe JSON → media info. Throws PermanentJobError for unusable files. */
export function parseProbe(json: ProbeJson): MediaInfo {
  const video = json.streams?.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  if (!video || !video.width || !video.height) throw new PermanentJobError("No video stream found in this file.");
  const audio = json.streams?.find((s) => s.codec_type === "audio");
  const seconds = Number(json.format?.duration ?? video.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new PermanentJobError(UNREADABLE);
  const created = Date.parse(json.format?.tags?.creation_time ?? "");
  return {
    durationMs: Math.round(seconds * 1000),
    width: video.width,
    height: video.height,
    fps: rate(video.avg_frame_rate) ?? rate(video.r_frame_rate),
    container: json.format?.format_name ?? "unknown",
    videoCodec: video.codec_name ?? "unknown",
    audioCodec: audio?.codec_name ?? null,
    pixFmt: video.pix_fmt ?? null,
    // Ignore zeroed or implausible tags (some encoders write 1970/1904).
    createdAt: Number.isFinite(created) && created > Date.UTC(2000, 0, 1) && created < Date.now() + 86_400_000 ? created : null,
  };
}

const BROWSER_VIDEO = new Set(["h264", "vp8", "vp9", "av1"]);
const BROWSER_AUDIO = new Set(["aac", "mp3", "opus", "vorbis"]);

/** Whether the original plays in Chromium/Safari/Firefox as-is, or needs an H.264 proxy. */
export function needsProxy(info: MediaInfo, ext: string): boolean {
  if (!["mp4", "mov", "webm"].includes(ext)) return true;
  if (!BROWSER_VIDEO.has(info.videoCodec)) return true;
  if (info.audioCodec && !BROWSER_AUDIO.has(info.audioCodec)) return true;
  // 10-bit / 4:4:4 H.264 doesn't decode in browsers.
  return info.videoCodec === "h264" && info.pixFmt !== null && !["yuv420p", "yuvj420p"].includes(info.pixFmt);
}

export async function probeFile(file: string, signal?: AbortSignal): Promise<MediaInfo> {
  let stdout: string;
  try {
    // Arguments array, no shell: the path is never interpreted.
    ({ stdout } = await run(
      config.ffprobePath,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024, signal },
    ));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new Error("ffprobe not found — install FFmpeg (brew install ffmpeg)");
    if (signal?.aborted) throw err;
    throw new PermanentJobError(UNREADABLE);
  }
  try {
    return parseProbe(JSON.parse(stdout) as ProbeJson);
  } catch (err) {
    if (err instanceof PermanentJobError) throw err;
    throw new PermanentJobError(UNREADABLE);
  }
}
