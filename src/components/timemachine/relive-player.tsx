"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Mic, Pause, Play, RotateCcw, SkipBack, SkipForward, Waves, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/format";
import { clockSec } from "@/lib/timemachine/format";
import { initialRelive, reliveReducer } from "@/lib/timemachine/relive";
import type { TimelineMoment, TimelineRecording } from "@/lib/timemachine/types";

const FADE_MS = 450;

/** Relive This Night: the session's real moments, in order, from the original videos. */
export function RelivePlayer({
  sessionId,
  title,
  moments,
  recordings,
}: {
  sessionId: string;
  title: string;
  moments: TimelineMoment[];
  recordings: TimelineRecording[];
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [s, dispatch] = useReducer(reliveReducer, moments.length, initialRelive);
  const video = useRef<HTMLVideoElement>(null);
  // What the video is actually showing (set from media events), so the curtain lifts only once the seek lands.
  const [shown, setShown] = useState<{ id: string; offsetMs: number; ending: boolean } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const m = moments[s.index];
  const offsetMs = shown && shown.id === m?.id ? shown.offsetMs : 0;
  const curtain = !shown || shown.id !== m?.id || shown.ending;
  const rec = recordings.find((r) => r.id === m?.recordingId);
  const exitHref = `/sessions/${sessionId}`;

  // Load the current moment: one <video>, src swapped, seeked to the exact source time.
  useEffect(() => {
    const v = video.current;
    if (!v || !m || s.done) return;
    if (!rec?.videoUrl) {
      dispatch({ type: "error" });
      return;
    }
    const seek = () => {
      v.currentTime = m.startMs / 1000;
    };
    if (v.getAttribute("src") !== rec.videoUrl) {
      v.setAttribute("src", rec.videoUrl);
      v.addEventListener("loadedmetadata", seek, { once: true });
      v.load();
    } else seek();
    return () => v.removeEventListener("loadedmetadata", seek);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the moment changes
  }, [s.index, s.done, m?.id]);

  // Reflect play/pause.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (s.playing && !s.done) {
      v.play()
        .then(() => setBlocked(false))
        .catch((e: DOMException) => {
          // Autoplay with sound can be refused until the viewer interacts.
          if (e.name === "NotAllowedError") {
            setBlocked(true);
            dispatch({ type: "pause" });
          }
        });
    } else v.pause();
  }, [s.playing, s.done, s.index]);

  const onTime = useCallback(() => {
    const v = video.current;
    if (!v || !m) return;
    const t = v.currentTime * 1000;
    // Ignore stale frames from before the seek to this moment.
    if (t < m.startMs - 500 || t > m.endMs + 1500) return;
    setShown({ id: m.id, offsetMs: Math.max(0, t - m.startMs), ending: !reduce && t >= m.endMs - FADE_MS });
    if (t >= m.endMs) dispatch({ type: "ended" });
  }, [m, reduce]);

  // Keyboard: Space pause/resume, ←/→ previous/next, Esc exit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("button,a,input,select")) {
        if (e.key === " " || e.key === "Enter") return;
      }
      if (e.key === " ") {
        e.preventDefault();
        dispatch({ type: "toggle" });
      } else if (e.key === "ArrowRight") dispatch({ type: "next" });
      else if (e.key === "ArrowLeft") dispatch({ type: "prev" });
      else if (e.key === "Escape") dispatch({ type: "exit" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (s.exited) {
      video.current?.pause();
      router.push(exitHref);
    }
  }, [s.exited, router, exitHref]);

  if (!moments.length) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black p-6 text-center">
        <div>
          <p className="text-[17px] font-medium text-white">Nothing to relive yet</p>
          <p className="mt-2 max-w-sm text-[13.5px] text-white/60">This session has no moments. Analyze its recordings with Smart Clip first.</p>
          <Link href={exitHref} className="mt-5 inline-block text-[13px] font-medium text-accent-ink hover:text-white">
            ← Back to the session
          </Link>
        </div>
      </div>
    );
  }

  const momentLen = m ? m.endMs - m.startMs : 1;
  const failedHere = s.failed.includes(s.index);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="region" aria-label={`Relive ${title}`}>
      <video
        ref={video}
        playsInline
        preload="auto"
        onTimeUpdate={onTime}
        onSeeked={onTime}
        onError={() => dispatch({ type: "error" })}
        className="absolute inset-0 size-full object-contain"
        aria-label={m ? `${m.title}, ${rec?.title ?? "recording"} at ${timecode(m.startMs + offsetMs)}` : undefined}
      />
      {/* Transition curtain */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-black"
        initial={false}
        animate={{ opacity: curtain || s.done ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : FADE_MS / 1000, ease: "easeInOut" }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

      {/* Top bar */}
      <div className="relative flex items-center gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <p className="min-w-0 flex-1 truncate text-[12px] uppercase tracking-[0.2em] text-white/60">
          Relive · <span className="text-white/85">{title}</span>
        </p>
        <p className="font-mono text-[12px] text-white/70" aria-live="polite">
          {Math.min(s.index + 1, moments.length)} / {moments.length}
        </p>
        <button type="button" onClick={() => dispatch({ type: "exit" })} className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Exit Relive (Esc)">
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {/* Current event */}
      <div className="relative mt-auto px-4 pb-4 sm:px-8 sm:pb-8">
        <AnimatePresence mode="wait">
          {s.done ? (
            <motion.div key="done" initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-6 text-center" role="status">
              <p className="font-display text-[clamp(1.8rem,4vw,3rem)]">That was the night.</p>
              <p className="mt-2 text-[13.5px] text-white/60">
                {moments.length - s.failed.length} of {moments.length} moment{moments.length === 1 ? "" : "s"} played
                {s.failed.length ? ` · ${s.failed.length} couldn’t be played` : ""}.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button type="button" onClick={() => dispatch({ type: "restart" })} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/10 px-5 text-[14px] font-medium hover:bg-white/20">
                  <RotateCcw className="size-4" aria-hidden /> Watch again
                </button>
                <Link href={exitHref} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-medium hover:bg-accent-strong">
                  Back to the session
                </Link>
              </div>
            </motion.div>
          ) : (
            m && (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: reduce ? 0 : 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
                className="mb-5 max-w-3xl"
                aria-live="polite"
              >
                <p className="font-mono text-[12px] text-white/65">
                  {m.at !== null ? `${rec?.timeSource === "file-date" ? "≈ " : ""}${clockSec(m.at + offsetMs)}` : "Time unknown"} · {rec?.title} · {timecode(m.startMs + offsetMs)}
                </p>
                <h1 className="mt-1 font-display text-[clamp(1.6rem,4vw,2.8rem)] leading-tight">{m.title}</h1>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-white/70">
                  {m.evidence.slice(0, 3).map((e, k) => (
                    <span key={k} className="inline-flex items-center gap-1">
                      <Waves className="size-3.5" aria-hidden /> {e.label}
                    </span>
                  ))}
                </p>
                {m.speech[0] && (
                  <p className="mt-2 line-clamp-2 text-[14px] italic text-white/85">
                    <Mic className="mr-1 inline size-3.5 -translate-y-px" aria-hidden />“{m.speech.map((g) => g.text).join(" ")}”
                    <span className="text-[11.5px] not-italic text-white/50"> machine transcript, may contain errors</span>
                  </p>
                )}
                {failedHere && (
                  <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-warn">
                    <AlertTriangle className="size-3.5" aria-hidden /> This moment’s video couldn’t be played.
                  </p>
                )}
              </motion.div>
            )
          )}
        </AnimatePresence>

        {blocked && !s.playing && !s.done && (
          <p className="mb-3 text-[13px] text-white/75" role="status">
            Your browser paused playback until you press play.
          </p>
        )}
        {s.failed.length > 0 && !s.done && (
          <p className="mb-3 text-[12px] text-warn" role="status">
            Skipped {s.failed.length} moment{s.failed.length === 1 ? "" : "s"} whose video couldn’t be played.
          </p>
        )}

        {/* Position: one segment per moment, current one filling */}
        <div className="flex gap-1" role="group" aria-label="Moments">
          {moments.map((x, i) => (
            <button
              key={x.id}
              type="button"
              onClick={() => dispatch({ type: "jump", index: i })}
              aria-label={`Moment ${i + 1}: ${x.title}`}
              aria-current={i === s.index && !s.done ? "step" : undefined}
              className="group h-5 flex-1 py-2"
            >
              <span className={cn("block h-1 overflow-hidden rounded-full bg-white/20 transition-colors group-hover:bg-white/35", s.failed.includes(i) && "bg-warn/40")}>
                <span
                  className="block h-full rounded-full bg-white"
                  style={{ width: i < s.index || s.done ? "100%" : i === s.index ? `${Math.min(100, (offsetMs / momentLen) * 100)}%` : "0%" }}
                />
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-center gap-3">
          <button type="button" onClick={() => dispatch({ type: "prev" })} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Previous moment (←)">
            <SkipBack className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={s.done}
            onClick={() => dispatch({ type: "toggle" })}
            className="grid size-14 place-items-center rounded-full bg-white text-black hover:bg-white/90 disabled:opacity-40"
            aria-label={s.playing ? "Pause (Space)" : "Play (Space)"}
          >
            {s.playing ? <Pause className="size-6 fill-current" aria-hidden /> : <Play className="size-6 translate-x-px fill-current" aria-hidden />}
          </button>
          <button type="button" onClick={() => dispatch({ type: "next" })} className="grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Next moment (→)">
            <SkipForward className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
