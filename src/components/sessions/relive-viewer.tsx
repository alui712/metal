"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Scissors, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Game, Moment, Recording, Session } from "@/lib/memory/contracts";
import { formatLongDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { SceneArt } from "@/components/media/scene-art";
import { KindTag } from "@/components/memory/kind";
import { buttonClass } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EASE_OUT } from "@/components/ui/motion";

const INTRO_MS = 4200;
const MOMENT_MS = 6500;

type Slide =
  | { kind: "intro" }
  | { kind: "moment"; moment: Moment; recording: Recording }
  | { kind: "outro" };

/** Full-screen, auto-advancing retelling of a session's moments. */
export function ReliveViewer({
  session,
  game,
  moments,
  recordings,
}: {
  session: Session;
  game: Game | undefined;
  moments: Moment[];
  recordings: Recording[];
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const recById = new Map(recordings.map((r) => [r.id, r]));
  const slides: Slide[] = [
    { kind: "intro" },
    ...moments.map((m) => ({ kind: "moment" as const, moment: m, recording: recById.get(m.recordingId)! })),
    { kind: "outro" },
  ];

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const slide = slides[index];
  const slideMs = slide.kind === "intro" ? INTRO_MS : slide.kind === "moment" ? MOMENT_MS : Infinity;
  const exitHref = `/sessions/${session.id}`;

  const elapsedRef = useRef(0);
  function go(to: number) {
    setIndex(Math.max(0, Math.min(slides.length - 1, to)));
    elapsedRef.current = 0;
    setElapsed(0);
  }

  // Advance on a real-time clock that pauses with the viewer.
  useEffect(() => {
    if (paused || !Number.isFinite(slideMs)) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsedRef.current += now - last;
      last = now;
      if (elapsedRef.current >= slideMs) {
        elapsedRef.current = 0;
        setElapsed(0);
        setIndex((i) => Math.min(i + 1, slides.length - 1));
        return;
      }
      setElapsed(elapsedRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, slideMs, index, slides.length]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") router.push(exitHref);
    else if (e.key === " " || e.key === "k") {
      e.preventDefault();
      setPaused((p) => !p);
    } else if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
  }

  const momentSlides = slides.filter((s) => s.kind === "moment").length;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="region"
      aria-roledescription="slideshow"
      aria-label={`Relive ${session.title}`}
      className="fixed inset-0 z-[60] overflow-hidden bg-black text-white outline-none"
    >
      {/* Art */}
      <AnimatePresence initial={false}>
        <motion.div
          key={index}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.3 : 1.1, ease: "easeInOut" }}
        >
          <motion.div
            className="absolute inset-0"
            // Target must not depend on reduced motion (unknown during SSR); with it on,
            // MotionConfig reducedMotion="user" applies the scale instantly instead of drifting.
            initial={{ scale: 1 }}
            animate={{ scale: paused ? undefined : 1.12 }}
            transition={{ duration: (Number.isFinite(slideMs) ? slideMs : 12000) / 1000 + 1, ease: "linear" }}
          >
            <SceneArt
              art={
                slide.kind === "moment"
                  ? { ...slide.recording.art, seed: slide.recording.art.seed + slide.moment.startMs / 1000 }
                  : session.art
              }
            />
          </motion.div>
        </motion.div>
      </AnimatePresence>
      <div aria-hidden className="grain absolute inset-0" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/50" />

      {/* Progress */}
      <div className="absolute inset-x-4 top-4 flex gap-1.5 sm:inset-x-8 sm:top-6" aria-hidden>
        {slides.slice(1, -1).map((_, i) => {
          const slideIdx = i + 1;
          const fill = slideIdx < index ? 1 : slideIdx === index ? elapsed / MOMENT_MS : 0;
          return (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/20">
              <span className="block h-full rounded-full bg-white" style={{ width: `${Math.min(1, fill) * 100}%` }} />
            </span>
          );
        })}
      </div>

      {/* Top bar */}
      <div className="absolute inset-x-4 top-9 flex items-center justify-between gap-3 sm:inset-x-8 sm:top-12">
        <div className="flex min-w-0 items-center gap-3">
          <p className="truncate text-[13px] font-medium text-white/75">{session.title}</p>
          <DemoBadge label="Demo stills" className="hidden bg-black/40 sm:inline-flex" />
        </div>
        <Link
          href={exitHref}
          aria-label="Exit relive"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur transition-colors hover:bg-white/20"
        >
          <X className="size-5" aria-hidden />
        </Link>
      </div>

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 px-6 pb-28 sm:px-12 sm:pb-32 lg:px-20" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial="hidden"
            animate="show"
            exit="exit"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: reduce ? 0 : 0.12, delayChildren: reduce ? 0 : 0.3 } },
              exit: { opacity: 0, transition: { duration: 0.25 } },
            }}
            className="max-w-4xl"
          >
            {slide.kind === "intro" && (
              <>
                <Line reduce={reduce} className="text-[13px] font-medium uppercase tracking-[0.24em] text-white/60">
                  {formatLongDate(session.startedAt)} · {game?.name}
                </Line>
                <Line reduce={reduce} className="mt-5 text-[clamp(3rem,9vw,8rem)] font-semibold leading-[0.88] tracking-[-0.05em]">
                  {session.title}
                </Line>
                <Line reduce={reduce} className="mt-6 font-display text-[clamp(1.25rem,2.4vw,1.75rem)] italic text-white/75">
                  {formatTime(session.startedAt)}. You, {session.friends.join(", ")}.
                </Line>
              </>
            )}
            {slide.kind === "moment" && (
              <>
                <Line reduce={reduce} className="flex items-center gap-3 text-[13px] text-white/65">
                  <span className="font-mono tabular-nums">{formatTime(slide.recording.recordedAt + slide.moment.startMs)}</span>
                  <KindTag kind={slide.moment.kind} className="text-white/80" />
                </Line>
                <Line reduce={reduce} className="mt-4 text-[clamp(2.25rem,6vw,5.25rem)] font-semibold leading-[0.95] tracking-[-0.045em]">
                  {slide.moment.title}
                </Line>
                {slide.moment.transcript[0] && (
                  <Line reduce={reduce} className="mt-6 max-w-2xl font-display text-[clamp(1.25rem,2.6vw,2rem)] italic leading-snug text-white/85">
                    “{slide.moment.transcript.at(-1)!.text}”
                    <span className="ml-3 font-sans text-[14px] not-italic text-white/50">— {slide.moment.transcript.at(-1)!.speaker}</span>
                  </Line>
                )}
              </>
            )}
            {slide.kind === "outro" && (
              <>
                <Line reduce={reduce} className="font-display text-[clamp(2.5rem,7vw,6rem)] italic leading-none text-white">
                  That was the night.
                </Line>
                <Line reduce={reduce} className="mt-5 text-[16px] text-white/65">
                  {momentSlides} moments, {formatTime(session.startedAt)} to {formatTime(session.endedAt)}.
                </Line>
                <Line reduce={reduce} className="mt-8 flex flex-wrap gap-3">
                  <Link href={`/studio?session=${session.id}`} className={buttonClass("primary", "lg")}>
                    <Scissors className="size-5" aria-hidden /> Create story
                  </Link>
                  <button type="button" onClick={() => go(0)} className={buttonClass("secondary", "lg", "bg-white/10")}>
                    <RotateCcw className="size-5" aria-hidden /> Watch again
                  </button>
                </Line>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-2 sm:bottom-8">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous" className="grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-30">
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          disabled={slide.kind === "outro"}
          aria-label={paused ? "Play" : "Pause"}
          className="grid size-12 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-30"
        >
          {paused ? <Play className="ml-0.5 size-5" fill="currentColor" aria-hidden /> : <Pause className="size-5" fill="currentColor" aria-hidden />}
        </button>
        <button type="button" onClick={() => go(index + 1)} disabled={index === slides.length - 1} aria-label="Next" className="grid size-11 place-items-center rounded-full bg-white/10 backdrop-blur transition-colors hover:bg-white/20 disabled:opacity-30">
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <p className="sr-only">Space to pause, arrow keys to move between moments, Escape to exit.</p>
    </div>
  );
}

function Line({ children, className, reduce }: { children: React.ReactNode; className?: string; reduce: boolean | null }) {
  return (
    <motion.div
      variants={{
        // Same hidden state on server and client (reduced motion is unknown during SSR);
        // MotionConfig reducedMotion="user" snaps the y offset instead of animating it.
        hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
        show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: reduce ? 0.2 : 0.9, ease: EASE_OUT } },
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
