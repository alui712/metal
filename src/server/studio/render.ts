import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { JobContext } from "../../worker/handlers";
import { paths } from "../config";
import type { Db } from "../db/client";
import { recordings, renderExports } from "../db/schema";
import { PermanentJobError } from "../jobs/errors";
import { runFfmpeg } from "../media/ffmpeg";
import { probeFile } from "../media/probe";
import { managedPath } from "../media/storage";

// Story export: one FFmpeg pass over the real source recordings. Every clip is
// cut frame-accurately and normalized (size, 30 fps, yuv420p, 48 kHz stereo)
// before a hard-cut concat, so mixed resolutions, frame rates and codecs join
// cleanly. Video and audio are each forced to exactly the clip's length, which
// keeps them in sync across cuts; clips without audio get silence.

export type Aspect = "16:9" | "9:16" | "1:1";
export type Framing = "fill" | "fit";
export type Edl = {
  title: string;
  aspect: Aspect;
  framing: Framing;
  captions: boolean;
  clips: Array<{ recordingId: string | null; inMs: number; outMs: number; caption: string | null }>;
};

export const OUTPUT_SIZE: Record<Aspect, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};
export const OUTPUT_FPS = 30;
export const MAX_STORY_MS = 30 * 60_000;
/** Allowed difference between the rendered and the planned duration. */
export const DURATION_TOLERANCE_MS = 300;

export type RenderInput = { file: string; inMs: number; outMs: number; hasAudio: boolean };

const sec = (ms: number) => (ms / 1000).toFixed(3);

export function storyArgs(inputs: RenderInput[], output: string, opts: { aspect: Aspect; framing: Framing; subtitles?: string }): string[] {
  const { width: W, height: H } = OUTPUT_SIZE[opts.aspect];
  const frame =
    opts.framing === "fill"
      ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
      : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;
  const args = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y"];
  for (const c of inputs) args.push("-ss", sec(c.inMs), "-t", sec(c.outMs - c.inMs), "-i", c.file);
  if (opts.subtitles) args.push("-i", opts.subtitles);
  const chains: string[] = [];
  inputs.forEach((c, i) => {
    const d = sec(c.outMs - c.inMs);
    // tpad holds the last frame if a source ends a few ms early; trim makes the length exact.
    chains.push(`[${i}:v:0]setpts=PTS-STARTPTS,fps=${OUTPUT_FPS},${frame},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`);
    chains.push(
      c.hasAudio
        ? `[${i}:a:0]asetpts=PTS-STARTPTS,aresample=48000:async=1,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${d},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${i}]`,
    );
  });
  chains.push(`${inputs.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${inputs.length}:v=1:a=1[v][a]`);
  args.push("-filter_complex", chains.join(";"), "-map", "[v]", "-map", "[a]");
  if (opts.subtitles) args.push("-map", `${inputs.length}:s:0`, "-c:s", "mov_text", "-metadata:s:s:0", "language=eng");
  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(OUTPUT_FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart",
    "-progress", "pipe:1", "-nostats",
    output,
  );
  return args;
}

/** SRT for clip captions on the story timeline (a soft subtitle track; this FFmpeg can't burn text in). */
export function captionsSrt(clips: Edl["clips"]): string | null {
  const ts = (ms: number) => {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor(ms / 60_000) % 60;
    const s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  const cues: string[] = [];
  let t = 0;
  for (const c of clips) {
    const d = c.outMs - c.inMs;
    const text = c.caption?.replace(/[\r\n]+/g, " ").trim();
    if (text) cues.push(`${cues.length + 1}\n${ts(t)} --> ${ts(t + d)}\n${text}\n`);
    t += d;
  }
  return cues.length ? cues.join("\n") : null;
}

export type SourceIssue = { index: number; reason: string };

/** Checks every clip's source: still in the library, playable, file present, range inside the video. */
export function checkSources(db: Db, clips: Edl["clips"]): { issues: SourceIssue[]; inputs: RenderInput[] } {
  const issues: SourceIssue[] = [];
  const inputs: RenderInput[] = [];
  clips.forEach((c, index) => {
    const r = c.recordingId ? db.select().from(recordings).where(eq(recordings.id, c.recordingId)).get() : undefined;
    if (!r) return void issues.push({ index, reason: "Its source recording was deleted." });
    if (r.status !== "ready" && r.status !== "analyzed") return void issues.push({ index, reason: `“${r.title}” isn’t ready to use (${r.status}).` });
    let file: string | null = null;
    for (const rel of [r.originalPath, r.proxyPath]) {
      if (!rel) continue;
      try {
        const abs = managedPath(rel);
        if (fs.statSync(abs).isFile()) {
          file = abs;
          break;
        }
      } catch {}
    }
    if (!file) return void issues.push({ index, reason: `“${r.title}” is missing from storage.` });
    const dur = r.durationMs ?? 0;
    if (!(c.inMs >= 0 && c.outMs <= dur + 50 && c.outMs - c.inMs >= 500)) return void issues.push({ index, reason: `The clip from “${r.title}” is outside the video.` });
    inputs.push({ file, inMs: c.inMs, outMs: Math.min(c.outMs, dur), hasAudio: Boolean(r.audioCodec) });
  });
  return { issues, inputs };
}

export const exportFile = (id: string) => path.join(/*turbopackIgnore: true*/ paths.exports, `${id}.mp4`);
export const isExportId = (id: string) => /^exp_[a-f0-9]{16}$/.test(id);

/** Worker job "story-export". */
export async function renderStory({ db, job, progress, signal }: JobContext): Promise<void> {
  const { exportId } = JSON.parse(job.payloadJson) as { exportId: string };
  if (!isExportId(exportId)) throw new PermanentJobError("Invalid export.");
  const exp = db.select().from(renderExports).where(eq(renderExports.id, exportId)).get();
  if (!exp?.edlJson) return; // project deleted meanwhile
  const set = (v: Partial<typeof renderExports.$inferInsert>) => db.update(renderExports).set(v).where(eq(renderExports.id, exportId)).run();
  const edl = JSON.parse(exp.edlJson) as Edl;
  fs.mkdirSync(paths.exports, { recursive: true });
  const out = exportFile(exportId);
  const part = path.join(/*turbopackIgnore: true*/ paths.exports, `${exportId}.part.mp4`);
  const srt = path.join(/*turbopackIgnore: true*/ paths.exports, `${exportId}.srt`);
  try {
    set({ status: "running", error: null });
    progress({ stage: "checking", progress: 0.02 });
    const { issues, inputs } = checkSources(db, edl.clips);
    if (issues.length) throw new PermanentJobError(`Clip ${issues[0].index + 1}: ${issues[0].reason}`);
    if (!inputs.length) throw new PermanentJobError("The story has no clips.");
    const total = inputs.reduce((a, c) => a + (c.outMs - c.inMs), 0);
    if (total > MAX_STORY_MS) throw new PermanentJobError("Stories can be at most 30 minutes long.");
    const subs = edl.captions ? captionsSrt(edl.clips) : null;
    if (subs) fs.writeFileSync(srt, subs);
    const args = storyArgs(inputs, part, { aspect: edl.aspect, framing: edl.framing, subtitles: subs ? srt : undefined });
    set({ ffmpegCmd: args.map((a) => (path.isAbsolute(a) ? path.basename(a) : a)).join(" ") });
    progress({ stage: "rendering", progress: 0.05 });
    await runFfmpeg(args, {
      signal,
      timeoutMs: Math.max(180_000, total * 20),
      onProgressMs: (ms) => progress({ stage: "rendering", progress: 0.05 + 0.9 * Math.min(1, ms / total) }),
    });
    progress({ stage: "verifying", progress: 0.97 });
    const info = await probeFile(part, signal).catch(() => null);
    if (!info || info.videoCodec !== "h264" || info.audioCodec !== "aac") throw new Error("The rendered file isn’t a valid H.264/AAC video.");
    if (Math.abs(info.durationMs - total) > DURATION_TOLERANCE_MS) throw new Error(`The rendered video is ${info.durationMs} ms long; expected ${total} ms.`);
    fs.renameSync(part, out);
    set({ status: "succeeded", outputPath: path.basename(out), durationMs: info.durationMs, sizeBytes: fs.statSync(out).size, finishedAt: Date.now(), error: null });
  } catch (err) {
    fs.rmSync(part, { force: true });
    const permanent = err instanceof PermanentJobError;
    const message = permanent ? (err as Error).message : `Rendering failed: ${(err as Error).message}`;
    if (permanent || job.attempts >= job.maxAttempts) set({ status: "failed", error: message, finishedAt: Date.now() });
    else set({ status: "queued", error: `Retrying after an error: ${(err as Error).message}` });
    throw err;
  } finally {
    fs.rmSync(srt, { force: true });
  }
}
