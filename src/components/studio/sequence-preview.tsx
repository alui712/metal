"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CAPTION_BOTTOM, CAPTION_FONT, wrapCaption } from "@/lib/studio/caption-layout";
import type { StoryProject } from "@/lib/memory/contracts";
import { locate, secondaryTime, totalDuration } from "@/lib/studio/edl";
import { timecode } from "@/lib/format";
import { SceneArt } from "@/components/media/scene-art";
import { Scrubber } from "@/components/media/scrubber";
import { usePlaybackClock } from "@/components/media/use-playback-clock";
import { DemoBadge } from "@/components/ui/demo-badge";
import { secondOf } from "./clip-thumb";
import type { StudioLibrary } from "./types";

/** The second POV re-seeks when it drifts this far from the first. */
const SPLIT_DRIFT_MS = 80;

/**
 * Plays the edit in order, without rendering. Demo clips have no video,
 * so each clip shows its still with the caption and a live playhead.
 */
export function SequencePreview({
  project,
  library,
  seekTo,
  onClipChange,
}: {
  project: StoryProject;
  library: StudioLibrary;
  seekTo: { ms: number; nonce: number } | null;
  onClipChange?: (clipId: string) => void;
}) {
  const reduce = useReducedMotion();
  const total = totalDuration(project);
  const clock = usePlaybackClock(total);
  const { seek } = clock;
  const at = locate(project, clock.timeMs);
  const clip = at?.clip;
  const rec = clip ? library.recordings[clip.recordingId] : undefined;
  const moment = clip?.momentId ? library.moments[clip.momentId] : undefined;
  const ended = total > 0 && clock.timeMs >= total;
  const src = rec?.media.kind === "video" ? rec.media.src : null;
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Side by side: the second POV follows the first (its time = secondary in + offset), muted.
  const second = clip ? secondOf(library, clip) : undefined;
  const secondSrc = second && second !== "missing" && second.media.kind === "video" ? second.media.src : null;
  const video2 = useRef<HTMLVideoElement>(null);
  const vertical = project.aspect === "9:16";

  // Real clips: the <video> follows the edit's clock (exact source time = clip in + offset).
  const expected = clip ? (clip.inMs + (at?.offsetMs ?? 0)) / 1000 : 0;
  useEffect(() => {
    const v = video.current;
    if (!v || !src) return;
    if (v.getAttribute("src") !== src) {
      v.setAttribute("src", src);
      v.load();
    }
    if (v.readyState >= 1 && Math.abs(v.currentTime - expected) > 0.35) v.currentTime = expected;
    if (clock.playing && v.paused) void v.play().catch(() => {});
    if (!clock.playing && !v.paused) v.pause();
  }, [src, expected, clock.playing]);

  useEffect(() => {
    const v2 = video2.current;
    if (!v2 || !secondSrc || !clip?.secondary) return;
    if (v2.getAttribute("src") !== secondSrc) {
      v2.setAttribute("src", secondSrc);
      v2.load();
    }
    const c = clip;
    let raf = 0;
    const follow = () => {
      const v = video.current;
      // The first POV's own clock when it's playing, else the edit's clock.
      const ownMs = v && v.readyState >= 2 && !v.seeking ? v.currentTime * 1000 : c.inMs + (at?.offsetMs ?? 0);
      const want = secondaryTime(c, Math.min(Math.max(ownMs, c.inMs), c.outMs))!;
      if (v2.readyState >= 1 && Math.abs(v2.currentTime * 1000 - want) > SPLIT_DRIFT_MS) v2.currentTime = want / 1000;
      if (clock.playing) raf = requestAnimationFrame(follow);
    };
    follow();
    if (clock.playing && v2.paused) void v2.play().catch(() => {});
    if (!clock.playing && !v2.paused) v2.pause();
    return () => cancelAnimationFrame(raf);
  }, [secondSrc, clip, at?.offsetMs, clock.playing]);

  const seekMs = seekTo?.ms;
  const nonce = seekTo?.nonce;
  useEffect(() => {
    if (seekMs !== undefined) seek(seekMs);
  }, [seekMs, nonce, seek]);

  const clipId = clip?.id;
  useEffect(() => {
    if (clipId && clock.playing) onClipChange?.(clipId);
  }, [clipId, clock.playing, onClipChange]);

  const boundaries = project.clips.reduce<{ id: string; startMs: number; endMs: number; label: string }[]>((acc, c) => {
    const start = acc.at(-1)?.endMs ?? 0;
    acc.push({ id: c.id, startMs: start, endMs: start + (c.outMs - c.inMs), label: c.caption ?? "" });
    return acc;
  }, []);

  const frame =
    project.aspect === "16:9"
      ? "aspect-video w-full"
      : project.aspect === "1:1"
        ? "aspect-square h-full max-h-full"
        : "aspect-[9/16] h-full max-h-full";

  return (
    <div className="flex flex-col">
      <div className="relative grid h-[min(56vw,520px)] min-h-[260px] place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_center,var(--graphite-800),var(--graphite-950))] ring-1 ring-line">
        <motion.div
          layout={!reduce}
          transition={{ type: "spring", bounce: 0.12, duration: 0.6 }}
          className={`relative overflow-hidden rounded-lg bg-black shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)] ${frame}`}
          style={{ containerType: "inline-size" }}
        >
          {clip && rec ? (
            <>
              <AnimatePresence initial={false}>
                <motion.div
                  key={clip.id}
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0.1 : 0.35 }}
                >
                  {src ? null : (
                    <div
                      className="absolute inset-0"
                      style={{
                        transform: reduce ? undefined : `scale(${1.03 + ((at?.offsetMs ?? 0) / Math.max(1, clip.outMs - clip.inMs)) * 0.06})`,
                      }}
                    >
                      <SceneArt art={{ ...rec.art, seed: rec.art.seed + (moment?.startMs ?? clip.inMs) / 1000 }} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
              {src && (
                <video
                  ref={video}
                  playsInline
                  preload="auto"
                  aria-label={`${rec.title} at ${timecode(clip.inMs + (at?.offsetMs ?? 0))}`}
                  onLoadedMetadata={(e) => {
                    e.currentTarget.currentTime = expected;
                    setFailed(null);
                  }}
                  onError={() => setFailed(rec.title)}
                  className={`absolute bg-black ${second ? (vertical ? "inset-x-0 top-0 h-1/2 w-full" : "inset-y-0 left-0 h-full w-1/2") : "inset-0 size-full"} ${project.framing === "fit" ? "object-contain" : "object-cover"}`}
                />
              )}
              {second && (
                <div className={`absolute bg-black ${vertical ? "inset-x-0 bottom-0 h-1/2" : "inset-y-0 right-0 w-1/2"}`}>
                  {secondSrc ? (
                    <video
                      ref={video2}
                      muted
                      playsInline
                      preload="auto"
                      aria-label={`${second !== "missing" ? second.title : ""} at ${timecode(secondaryTime(clip, clip.inMs + (at?.offsetMs ?? 0)) ?? 0)}`}
                      className={`size-full ${project.framing === "fit" ? "object-contain" : "object-cover"}`}
                    />
                  ) : (
                    <p className="grid size-full place-items-center p-4 text-center text-[12px] text-ink-muted">
                      {second === "missing" ? "This POV’s recording was deleted." : "This POV can’t be played."}
                    </p>
                  )}
                </div>
              )}
              {failed && (
                <p className="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-[13px] text-ink-muted">
                  “{failed}” can’t be played — its video may be missing from the library.
                </p>
              )}
              {project.captions && clip.caption?.trim() && (
                // Same box and line breaks as the burned-in export caption (src/lib/studio/caption-layout.ts).
                <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ bottom: `${CAPTION_BOTTOM[project.aspect] * 100}%` }}>
                  <p
                    className="max-w-[88%] whitespace-pre rounded-[0.45em] bg-black/58 px-[0.8em] py-[0.45em] text-center font-bold leading-[1.25] text-white"
                    style={{ fontSize: `${(project.aspect === "16:9" ? (CAPTION_FONT * 1080) / 1920 : CAPTION_FONT) * 100}cqw`, fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif" }}
                  >
                    {wrapCaption(clip.caption, project.aspect).join("\n")}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-[14px] text-ink-faint">
              Add moments to start your story.
            </div>
          )}
        </motion.div>
        {library.source === "demo" ? (
          <DemoBadge label="Simulated preview · stills" className="absolute right-3 top-3 bg-black/50" />
        ) : (
          <span className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
            Live preview from your originals · not rendered
          </span>
        )}
        {second && (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
            Side by side · aligned
          </span>
        )}
        {moment && (
          <p className="absolute left-3 top-3 max-w-[50%] truncate rounded-full bg-black/50 px-3 py-1 text-[12px] text-white/80 backdrop-blur">
            {moment.title}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={clock.toggle}
          disabled={total === 0}
          aria-label={clock.playing ? "Pause preview" : ended ? "Replay preview" : "Play preview"}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-40"
        >
          {clock.playing ? (
            <Pause className="size-4" fill="currentColor" aria-hidden />
          ) : ended ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : (
            <Play className="ml-0.5 size-4" fill="currentColor" aria-hidden />
          )}
        </button>
        <Scrubber
          timeMs={clock.timeMs}
          durationMs={Math.max(total, 1)}
          onSeek={clock.seek}
          markers={boundaries}
          activeMarkerId={clip?.id}
          label="Seek story preview"
        />
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink-muted">
          {timecode(clock.timeMs)} <span className="text-ink-faint">/ {timecode(total)}</span>
        </span>
      </div>
    </div>
  );
}
