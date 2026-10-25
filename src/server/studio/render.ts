import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { CAPTION_BOTTOM, CAPTION_CHAR_EM, captionFontPx, wrapCaption } from "@/lib/studio/caption-layout";
import type { JobContext } from "../../worker/handlers";
import { paths } from "../config";
import type { Db } from "../db/client";
import { recordings, renderExports } from "../db/schema";
import { PermanentJobError } from "../jobs/errors";
import { runFfmpeg } from "../media/ffmpeg";
import { probeFile } from "../media/probe";
import { managedPath } from "../media/storage";
import type { SplitPov } from "@/lib/memory/contracts";

// Story export: one FFmpeg pass over the real source recordings. Every clip is
// cut frame-accurately and normalized (size, 30 fps, yuv420p, 48 kHz stereo)
// before a hard-cut concat, so mixed resolutions, frame rates and codecs join
// cleanly. Video and audio are each forced to exactly the clip's length, which
// keeps them in sync across cuts; clips without audio get silence. A
// side-by-side clip (Multi-POV) cuts a second POV at its aligned in-point and
// stacks both halves into one frame; its sound is the primary POV's.

export type Aspect = "16:9" | "9:16" | "1:1";
export type Framing = "fill" | "fit";
export type Edl = {
  title: string;
  aspect: Aspect;
  framing: Framing;
  captions: boolean;
  clips: Array<{ recordingId: string | null; inMs: number; outMs: number; caption: string | null; secondary?: SplitPov | null }>;
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

/** `secondary`: the second POV of a side-by-side clip, cut from its own time `inMs` for the same length. */
export type RenderInput = { file: string; inMs: number; outMs: number; hasAudio: boolean; secondary?: { file: string; inMs: number } };

/** Side-by-side halves: left|right, except top/bottom in a vertical story. */
export const splitHalf = (aspect: Aspect) => {
  const { width: W, height: H } = OUTPUT_SIZE[aspect];
  return aspect === "9:16" ? { width: W, height: H / 2, stack: "vstack" as const } : { width: W / 2, height: H, stack: "hstack" as const };
};
/** A burned-in caption image shown over [startMs, endMs) of the story timeline. */
export type CaptionOverlay = { file: string; startMs: number; endMs: number };

// ── Burned-in captions ──────────────────────────────────────
// This FFmpeg has no drawtext/libass, so captions are drawn as SVG → PNG
// (sharp, already installed with Next) and composited with FFmpeg's overlay.
// The same layout is mirrored by the Studio preview.

const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Word-wrapped caption box (≤ 3 lines) as SVG. Pure; widths are estimates, so the box is generous. */
export { CAPTION_BOTTOM, captionFontPx };

export function captionSvg(text: string, aspect: Aspect): { svg: string; width: number; height: number } | null {
  const lines = wrapCaption(text, aspect);
  if (!lines.length) return null;
  const { width: W } = OUTPUT_SIZE[aspect];
  const fs = captionFontPx(aspect);
  const charW = fs * CAPTION_CHAR_EM;
  const lineH = Math.round(fs * 1.25);
  const padX = Math.round(fs * 0.8);
  const padY = Math.round(fs * 0.45);
  const width = Math.min(Math.round(W * 0.88), Math.round(Math.max(...lines.map((l) => l.length)) * charW + padX * 2));
  const height = lines.length * lineH + padY * 2;
  const tspans = lines.map((l, i) => `<tspan x="${width / 2}" y="${padY + Math.round(lineH * (i + 0.78))}">${xml(l)}</tspan>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="${Math.round(fs * 0.45)}" fill="#000" fill-opacity="0.58"/><text font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${fs}" font-weight="700" fill="#fff" text-anchor="middle">${tspans}</text></svg>`;
  return { svg, width, height };
}

/** Renders each clip's caption to a PNG next to the export; returns the overlays (empty if rendering isn't available). */
async function renderCaptionImages(clips: Edl["clips"], aspect: Aspect, dir: string, prefix: string): Promise<CaptionOverlay[]> {
  let sharp: (typeof import("sharp"))["default"];
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return [];
  }
  const out: CaptionOverlay[] = [];
  let t = 0;
  for (const [i, c] of clips.entries()) {
    const d = c.outMs - c.inMs;
    const box = c.caption ? captionSvg(c.caption, aspect) : null;
    if (box) {
      const file = path.join(/*turbopackIgnore: true*/ dir, `${prefix}.cap${i}.png`);
      await sharp(Buffer.from(box.svg)).png().toFile(file);
      out.push({ file, startMs: t, endMs: t + d });
    }
    t += d;
  }
  return out;
}

const sec = (ms: number) => (ms / 1000).toFixed(3);

export function storyArgs(inputs: RenderInput[], output: string, opts: { aspect: Aspect; framing: Framing; subtitles?: string; overlays?: CaptionOverlay[] }): string[] {
  const { width: W, height: H } = OUTPUT_SIZE[opts.aspect];
  const frame = (w: number, h: number) =>
    opts.framing === "fill"
      ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
      : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`;
  const args = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y"];
  // Video inputs in clip order; a side-by-side clip's second POV directly follows its primary.
  // -reinit_filter 0: a source whose frame properties change mid-clip (e.g. an appended outro
  // encoded with other colour tags) would otherwise rebuild the whole graph, restarting every
  // chain's PTS-STARTPTS and silently skipping footage in all clips. Scale/format convert instead.
  const at: Array<{ main: number; second: number | null }> = [];
  let n = 0;
  for (const c of inputs) {
    const d = sec(c.outMs - c.inMs);
    args.push("-reinit_filter", "0", "-ss", sec(c.inMs), "-t", d, "-i", c.file);
    if (c.secondary) args.push("-reinit_filter", "0", "-ss", sec(c.secondary.inMs), "-t", d, "-i", c.secondary.file);
    at.push({ main: n, second: c.secondary ? n + 1 : null });
    n += c.secondary ? 2 : 1;
  }
  const overlays = opts.overlays ?? [];
  for (const o of overlays) args.push("-i", o.file);
  if (opts.subtitles) args.push("-i", opts.subtitles);
  const half = splitHalf(opts.aspect);
  const chains: string[] = [];
  inputs.forEach((c, i) => {
    const d = sec(c.outMs - c.inMs);
    const { main, second } = at[i];
    // tpad holds the last frame if a source ends a few ms early; trim makes the length exact.
    const cut = (input: number, w: number, h: number, label: string) =>
      `[${input}:v:0]setpts=PTS-STARTPTS,fps=${OUTPUT_FPS},${frame(w, h)},setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=1,trim=duration=${d},setpts=PTS-STARTPTS[${label}]`;
    if (second === null) chains.push(cut(main, W, H, `v${i}`));
    else {
      // Both halves start at the same moment (aligned in-points) and run exactly d.
      chains.push(cut(main, half.width, half.height, `v${i}l`), cut(second, half.width, half.height, `v${i}r`));
      chains.push(`[v${i}l][v${i}r]${half.stack}=inputs=2[v${i}]`);
    }
    chains.push(
      c.hasAudio
        ? `[${main}:a:0]asetpts=PTS-STARTPTS,aresample=48000:async=1,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${d},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${i}]`,
    );
  });
  const concatOut = overlays.length ? "[vc]" : "[v]";
  chains.push(`${inputs.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${inputs.length}:v=1:a=1${concatOut}[a]`);
  // Burned-in captions: each image composited over its clip's span, bottom-centered.
  const bottom = Math.round(H * CAPTION_BOTTOM[opts.aspect]);
  overlays.forEach((o, k) => {
    const from = k === 0 ? "[vc]" : `[vo${k - 1}]`;
    const to = k === overlays.length - 1 ? "[v]" : `[vo${k}]`;
    chains.push(`${from}[${n + k}:v]overlay=x=(W-w)/2:y=H-h-${bottom}:enable='between(t,${sec(o.startMs)},${sec(o.endMs - 1)})':format=auto${to}`);
  });
  args.push("-filter_complex", chains.join(";"), "-map", "[v]", "-map", "[a]");
  if (opts.subtitles) args.push("-map", `${n + overlays.length}:s:0`, "-c:s", "mov_text", "-metadata:s:s:0", "language=eng");
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
  const source = (id: string) => {
    const r = db.select().from(recordings).where(eq(recordings.id, id)).get();
    if (!r) return { r: null, file: null };
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
    return { r, file };
  };
  const ready = (status: string) => status === "ready" || status === "analyzed";
  clips.forEach((c, index) => {
    const { r, file } = c.recordingId ? source(c.recordingId) : { r: null, file: null };
    if (!r) return void issues.push({ index, reason: "Its source recording was deleted." });
    if (!ready(r.status)) return void issues.push({ index, reason: `“${r.title}” isn’t ready to use (${r.status}).` });
    if (!file) return void issues.push({ index, reason: `“${r.title}” is missing from storage.` });
    const dur = r.durationMs ?? 0;
    if (!(c.inMs >= 0 && c.outMs <= dur + 50 && c.outMs - c.inMs >= 500)) return void issues.push({ index, reason: `The clip from “${r.title}” is outside the video.` });
    const outMs = Math.min(c.outMs, dur);
    // A side-by-side clip needs its second POV just as much; never fall back to one POV silently.
    let secondary: RenderInput["secondary"];
    if (c.secondary) {
      const s = c.secondary.recordingId ? source(c.secondary.recordingId) : { r: null, file: null };
      if (!s.r) return void issues.push({ index, reason: "Its second POV’s recording was deleted." });
      if (s.r.id === r.id) return void issues.push({ index, reason: "Both sides show the same recording." });
      if (!ready(s.r.status)) return void issues.push({ index, reason: `“${s.r.title}” isn’t ready to use (${s.r.status}).` });
      if (!s.file) return void issues.push({ index, reason: `“${s.r.title}” is missing from storage.` });
      if (!(c.secondary.inMs >= 0 && c.secondary.inMs + (outMs - c.inMs) <= (s.r.durationMs ?? 0) + 50))
        return void issues.push({ index, reason: `“${s.r.title}” has no footage for part of this side-by-side clip.` });
      secondary = { file: s.file, inMs: c.secondary.inMs };
    }
    inputs.push({ file, inMs: c.inMs, outMs, hasAudio: Boolean(r.audioCodec), ...(secondary && { secondary }) });
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
  let overlays: CaptionOverlay[] = [];
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
    overlays = edl.captions ? await renderCaptionImages(edl.clips, edl.aspect, paths.exports, exportId) : [];
    const args = storyArgs(inputs, part, { aspect: edl.aspect, framing: edl.framing, subtitles: subs ? srt : undefined, overlays });
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
    for (const o of overlays) fs.rmSync(o.file, { force: true });
  }
}
