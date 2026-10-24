"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, LoaderCircle, Mic, Pause, Play, RotateCcw, SkipBack, SkipForward, Waves, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/format";
import { clockSec } from "@/lib/timemachine/format";
import { initialRelive, reliveReducer } from "@/lib/timemachine/relive";
import type { TimelineMoment, TimelineRecording } from "@/lib/timemachine/types";

const FADE_MS = 450;
/** After this long without a frame, offer Retry / Skip. */
const SLOW_MS = 8000;

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
  // Two <video> slots: moment i plays in slot i % 2 while moment i + 1 is loaded and
  // seeked in the other, so cuts between recordings crossfade instead of going black.
  const slots = useRef<Array<HTMLVideoElement | null>>([null, null]);
  const slotMoment = useRef<Array<string | null>>([null, null]);
  // Moment ids whose first frame is ready (seek landed) in their slot.
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());
  const [shown, setShown] = useState<{ id: string; offsetMs: number } | null>(null);
  const [blocked, setBlocked] = useState(false);
  // Moment id whose active slot reported `waiting` (stalled mid-play), and retries of the current load.
  const [waitingId, setWaitingId] = useState<string | null>(null);
  const [retries, setRetries] = useState(0);
  const [slowKey, setSlowKey] = useState<string | null>(null);
  const m = moments[s.index];
  const active = s.index % 2;
  const offsetMs = shown && shown.id === m?.id ? shown.offsetMs : 0;
  const curtain = s.done || !m || !ready.has(m.id);
  const rec = recordings.find((r) => r.id === m?.recordingId);
  const exitHref = `/sessions/${sessionId}`;
  const failedNow = s.failed.includes(s.index);
  // Visible status instead of a silent black screen; after SLOW_MS offer Retry / Skip.
  const loadingNow = !s.done && !!m && !failedNow && (curtain || waitingId === m.id);
  const loadKey = `${m?.id}:${retries}`;
  const slow = loadingNow && slowKey === loadKey;

  /** Loads a moment into a slot (src + exact seek). Returns false when it has no playable video. */
  const prime = useCallback(
    (slot: number, mm: TimelineMoment): boolean => {
      const v = slots.current[slot];
      const url = recordings.find((r) => r.id === mm.recordingId)?.videoUrl;
      if (!v || !url) return false;
      if (slotMoment.current[slot] === mm.id) return true;
      slotMoment.current[slot] = mm.id;
      const seek = () => {
        v.currentTime = mm.startMs / 1000;
      };
      if (v.getAttribute("src") !== url) {
        v.setAttribute("src", url);
        v.addEventListener("loadedmetadata", seek, { once: true });
        v.load();
      } else seek();
      return true;
    },
    [recordings],
  );

  // Current moment into its slot; the next one into the other slot once the crossfade is over.
  useEffect(() => {
    if (!m || s.done) return;
    if (!prime(active, m)) {
      dispatch({ type: "error" });
      return;
    }
    const next = moments[s.index + 1];
    if (!next) return;
    const t = setTimeout(() => prime(1 - active, next), reduce ? 0 : FADE_MS + 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the moment changes
  }, [s.index, s.done, m?.id]);

  // Reflect play/pause on the active slot; the other slot waits paused.
  useEffect(() => {
    const v = slots.current[active];
    slots.current[1 - active]?.pause();
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
  }, [s.playing, s.done, s.index, active]);

  const onSlotTime = useCallback(
    (slot: number) => {
      const v = slots.current[slot];
      const id = slotMoment.current[slot];
      const mm = moments.find((x) => x.id === id);
      if (!v || !mm) return;
      const t = v.currentTime * 1000;
      // Ignore frames from before this slot's seek landed.
      if (t < mm.startMs - 500 || t > mm.endMs + 1500) return;
      setReady((cur) => (cur.has(mm.id) ? cur : new Set(cur).add(mm.id)));
      if (slot !== active || mm.id !== m?.id) return;
      setShown({ id: mm.id, offsetMs: Math.max(0, t - mm.startMs) });
      if (t >= mm.endMs) dispatch({ type: "ended" });
    },
    [moments, active, m?.id],
  );

  useEffect(() => {
    if (!loadingNow) return;
    const t = setTimeout(() => setSlowKey(loadKey), SLOW_MS);
    return () => clearTimeout(t);
  }, [loadingNow, loadKey]);

  /** Reloads the current moment's video from scratch (Retry). */
  const reload = () => {
    const v = slots.current[active];
    if (!v || !m) return;
    slotMoment.current[active] = null;
    v.removeAttribute("src");
    setWaitingId(null);
    setRetries((n) => n + 1);
    if (prime(active, m) && s.playing) void v.play().catch(() => {});
  };

  const onSlotError = (slot: number) => {
    const id = slotMoment.current[slot];
    slotMoment.current[slot] = null;
    if (slot === active && id === m?.id) dispatch({ type: "error" });
  };

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
      slots.current.forEach((v) => v?.pause());
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
  const failedHere = failedNow;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="region" aria-label={`Relive ${title}`}>
      {[0, 1].map((slot) => (
        <video
          key={slot}
          ref={(el) => {
            slots.current[slot] = el;
          }}
          playsInline
          preload="auto"
          onTimeUpdate={() => onSlotTime(slot)}
          onSeeked={() => onSlotTime(slot)}
          onError={() => onSlotError(slot)}
          onWaiting={() => slot === active && setWaitingId(slotMoment.current[slot])}
          onPlaying={() => slot === active && setWaitingId(null)}
          aria-hidden={slot !== active}
          data-active={slot === active}
          className="absolute inset-0 size-full object-contain"
          style={{ opacity: slot === active ? 1 : 0, transition: reduce ? "none" : `opacity ${FADE_MS}ms ease-in-out` }}
          aria-label={slot === active && m ? `${m.title}, ${rec?.title ?? "recording"}` : undefined}
        />
      ))}
      {/* Curtain: only while the current moment's frame isn't ready (first load, or a jump). */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-black"
        initial={false}
        animate={{ opacity: curtain ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : FADE_MS / 1000, ease: "easeInOut" }}
      />
      {loadingNow && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
          <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl bg-black/55 px-6 py-5 text-center backdrop-blur" role="status">
            <LoaderCircle className="size-7 animate-spin text-white/80 motion-reduce:animate-none" aria-hidden />
            <p className="text-[14px] text-white/90">{curtain ? `Loading moment ${s.index + 1} of ${moments.length}…` : "Buffering…"}</p>
            {slow && (
              <>
                <p className="max-w-xs text-[12.5px] text-white/65">This is taking longer than usual. The video may still be loading from disk.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={reload} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-[13px] font-medium hover:bg-white/25">
                    <RotateCcw className="size-3.5" aria-hidden /> Retry
                  </button>
                  <button type="button" onClick={() => dispatch({ type: "next" })} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-[13px] font-medium hover:bg-white/25">
                    <SkipForward className="size-3.5" aria-hidden /> Skip moment
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/80 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

      {/* Top bar */}
      <div className="relative flex items-center gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
        <p className="min-w-0 flex-1 truncate text-[12px] uppercase tracking-[0.2em] text-white/60">
          Relive · <span className="text-white/85">{title}</span>
        </p>
        <p className="font-mono text-[12px] text-white/70" aria-hidden>
          {Math.min(s.index + 1, moments.length)} / {moments.length}
        </p>
        {/* Announced once per moment, without the ticking timecode. */}
        <p className="sr-only" aria-live="polite">
          {m && !s.done ? `Moment ${s.index + 1} of ${moments.length}: ${m.title}` : ""}
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
              className="group h-5 flex-1 rounded-sm py-2 outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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
