"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Moment, Recording } from "@/lib/memory/contracts";
import { timecode } from "@/lib/format";
import { cn } from "@/lib/cn";
import { DemoBadge } from "@/components/ui/demo-badge";
import { SceneArt } from "./scene-art";
import { Scrubber } from "./scrubber";
import { usePlaybackClock } from "./use-playback-clock";

export type SeekRequest = { ms: number; /** change to re-trigger the same position */ nonce: number; play?: boolean };

/**
 * Recording player. Real recordings (media.kind === "video") use <video>;
 * demo fixtures have no media file, so playback is simulated over the
 * poster art and clearly labeled as such.
 */
export function RecordingPlayer({
  recording,
  moments = [],
  seek,
  className,
  title,
}: {
  recording: Recording;
  moments?: Moment[];
  seek?: SeekRequest;
  className?: string;
  /** Visible label for the region (e.g. the selected moment). */
  title?: string;
}) {
  if (recording.media.kind === "video") {
    return <VideoPlayer src={recording.media.src} poster={recording.media.poster} seek={seek} className={className} title={title} />;
  }
  return <SimulatedPlayer recording={recording} moments={moments} seek={seek} className={className} title={title} />;
}

export function VideoPlayer({
  src,
  poster,
  seek,
  className,
  title,
}: {
  src: string;
  poster?: string;
  seek?: SeekRequest;
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const { ms: seekMs, nonce, play: seekPlay } = seek ?? {};
  useEffect(() => {
    const v = ref.current;
    if (!v || seekMs === undefined) return;
    v.currentTime = seekMs / 1000;
    if (seekPlay) void v.play().catch(() => {});
  }, [seekMs, nonce, seekPlay]);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      controls
      playsInline
      aria-label={title}
      className={cn("aspect-video w-full rounded-2xl bg-black object-contain", className)}
    />
  );
}

function SimulatedPlayer({
  recording,
  moments,
  seek,
  className,
  title,
}: {
  recording: Recording;
  moments: Moment[];
  seek?: SeekRequest;
  className?: string;
  title?: string;
}) {
  const reduce = useReducedMotion();
  const clock = usePlaybackClock(recording.durationMs);
  const { seek: clockSeek, play } = clock;
  const [hasInteracted, setHasInteracted] = useState(false);

  // Depend on the request's values, not its identity, so re-renders that
  // pass an equal object don't yank the playhead back.
  const { ms: seekMs, nonce, play: seekPlay } = seek ?? {};
  useEffect(() => {
    if (seekMs === undefined) return;
    clockSeek(seekMs);
    if (seekPlay) play();
  }, [seekMs, nonce, seekPlay, clockSeek, play]);

  const active = moments.find((m) => clock.timeMs >= m.startMs && clock.timeMs <= m.endMs) ?? null;
  const line = active?.transcript.filter((l) => l.tMs <= clock.timeMs).at(-1);
  const progress = clock.timeMs / recording.durationMs;
  const ended = clock.timeMs >= recording.durationMs;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement && e.key !== " ") return;
    if (e.key === " " || e.key === "k") {
      e.preventDefault();
      clock.toggle();
      setHasInteracted(true);
    } else if (e.key === "ArrowRight" || e.key === "l") {
      e.preventDefault();
      clock.seek(clock.timeMs + 5000);
    } else if (e.key === "ArrowLeft" || e.key === "j") {
      e.preventDefault();
      clock.seek(clock.timeMs - 5000);
    }
  }

  return (
    <section
      aria-label={title ? `Player: ${title}` : `Player: ${recording.title}`}
      onKeyDown={onKeyDown}
      className={cn("group/player relative isolate aspect-video w-full overflow-hidden rounded-2xl bg-black ring-1 ring-line", className)}
    >
      <div
        className="absolute inset-0 transition-transform duration-[1200ms] ease-out"
        style={{ transform: reduce ? undefined : `scale(${1.02 + progress * 0.08})` }}
      >
        <SceneArt art={recording.art} />
      </div>
      <div aria-hidden className="grain absolute inset-0" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4">
        <AnimatePresence mode="wait">
          {active && (
            <motion.p
              key={active.id}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="glass min-w-0 truncate rounded-full border border-line-strong px-3 py-1 text-[12px] font-medium text-ink"
            >
              {active.title}
            </motion.p>
          )}
        </AnimatePresence>
        <DemoBadge label="Simulated · no video" className="ml-auto bg-black/50" />
      </div>

      {line && (
        <p
          aria-live="polite"
          className="absolute inset-x-6 bottom-20 text-center text-[clamp(13px,1.6vw,17px)] font-medium text-white [text-shadow:0_2px_12px_rgb(0_0_0/0.9)]"
        >
          <span className="text-accent-ink">{line.speaker}:</span> {line.text}
        </p>
      )}

      {!clock.playing && !hasInteracted && (
        <button
          type="button"
          onClick={() => {
            clock.play();
            setHasInteracted(true);
          }}
          aria-label="Play simulated preview"
          className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-black/40 text-white backdrop-blur-md transition-transform hover:scale-105"
        >
          <Play className="ml-1 size-6" fill="currentColor" aria-hidden />
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-3 pb-3 sm:px-4 sm:pb-4">
        <button
          type="button"
          onClick={() => {
            clock.toggle();
            setHasInteracted(true);
          }}
          aria-label={clock.playing ? "Pause" : ended ? "Replay" : "Play"}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
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
          durationMs={recording.durationMs}
          onSeek={clock.seek}
          markers={moments.map((m) => ({ id: m.id, startMs: m.startMs, endMs: m.endMs, label: m.title }))}
          activeMarkerId={active?.id}
          label={`Seek ${recording.title}`}
        />
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-white/80">
          {timecode(clock.timeMs)} <span className="text-white/40">/ {timecode(recording.durationMs)}</span>
        </span>
      </div>
    </section>
  );
}
