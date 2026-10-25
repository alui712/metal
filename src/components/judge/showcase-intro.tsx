"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { RotateCcw, SkipForward } from "lucide-react";
import { EASE_OUT } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

// The showcase's opening film: ~5.5 s of approved real footage behind the
// headline, then it hands over to the floating memory cards. Muted, skippable,
// shown once per tab (Replay brings it back), never with reduced motion. The
// headline and both calls to action are usable the whole time.
//
// Source: an approved silent montage at /showcase/intro.mp4 when one has been
// supplied (see ADR 0020), otherwise the approved recordings' own posters.

export type IntroShot = { id: string; imageUrl: string; caption: string };
export type IntroVideo = { src: string; poster: string | null };

type Phase = "playing" | "done";
const SHOT_MS = 1850;
const MAX_VIDEO_MS = 7000;
const SEEN_KEY = "metal.showcase.intro";

// One tiny store so the film, the header controls and the card gate agree.
let phase: Phase = "playing";
let run = 0;
const subs = new Set<() => void>();
const set = (p: Phase) => {
  phase = p;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const useIntroPhase = () => useSyncExternalStore(subscribe, () => phase, () => "playing" as Phase);
const useTake = () => useSyncExternalStore(subscribe, () => run, () => 0);
const noop = () => () => {};

export function finishIntro() {
  if (phase === "done") return;
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {}
  set("done");
}
function replayIntro() {
  run += 1;
  set("playing");
}

/** Full-bleed film behind the hero. Server-rendered on its first frame, so there's never a blank first paint. */
export function IntroFilm({ shots, video }: { shots: IntroShot[]; video: IntroVideo | null }) {
  const reduce = useReducedMotion();
  const current = useIntroPhase();
  const root = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [useVideo, setUseVideo] = useState(Boolean(video));
  const [shot, setShot] = useState(0);
  const take = useTake();

  // First visit in this tab plays; later visits (and reduced motion) start on the cards.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (seen || reduce || matchMedia("(prefers-reduced-motion: reduce)").matches) set("done");
    else phase = "playing";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finishIntro();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      set("playing"); // the next visit decides again
    };
  }, [reduce]);

  // A clock that only runs while most of the film is on screen and the tab is visible.
  useEffect(() => {
    if (current !== "playing") return;
    const el = root.current;
    let visible = true;
    let elapsed = 0;
    let last = performance.now();
    let raf = 0;
    const io = new IntersectionObserver(([e]) => (visible = e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    if (el) io.observe(el);
    const v = player.current;
    if (useVideo && v) {
      v.currentTime = 0;
      void v.play().catch(() => setUseVideo(false));
    }
    const tick = (now: number) => {
      const on = visible && document.visibilityState === "visible";
      if (on) elapsed += now - last;
      last = now;
      if (useVideo && v) {
        if (!on && !v.paused) v.pause();
        else if (on && v.paused && !v.ended) void v.play().catch(() => {});
        if (v.ended || elapsed > MAX_VIDEO_MS) return finishIntro();
      } else {
        const i = Math.floor(elapsed / SHOT_MS);
        if (i >= shots.length) return finishIntro();
        setShot(i);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      v?.pause();
    };
  }, [current, take, useVideo, shots.length]);

  if (!shots.length && !video) return null;
  const playing = current === "playing";
  // After the film, the first shot stays behind the hero as a dim, blurred ambience.
  const showing = playing ? Math.min(shot, shots.length - 1) : 0;
  const caption = shots[showing]?.caption;

  return (
    <motion.div
      ref={root}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-[5] h-[min(100dvh,72rem)] overflow-hidden"
      initial={false}
      animate={playing ? { opacity: 1, scale: 1, filter: "blur(0px)" } : { opacity: 0.22, scale: reduce ? 1 : 1.04, filter: reduce ? "blur(0px)" : "blur(6px)" }}
      transition={{ duration: reduce ? 0.2 : 0.9, ease: EASE_OUT }}
    >
      {useVideo && video ? (
        <video
          ref={player}
          src={video.src}
          poster={video.poster ?? shots[0]?.imageUrl}
          muted
          playsInline
          preload="auto"
          onError={() => setUseVideo(false)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        shots.map((s, i) => (
          // Keyed by take so Replay restarts each push-in.
          // eslint-disable-next-line @next/next/no-img-element -- approved local poster
          <img
            key={`${s.id}:${take}`}
            src={s.imageUrl}
            alt=""
            fetchPriority={i === 0 ? "high" : "low"}
            data-active={(playing && i === showing) || undefined}
            className={cn("intro-shot absolute inset-0 size-full object-cover", i === showing ? "opacity-100" : "opacity-0")}
          />
        ))
      )}
      {/* Lighting: keep the headline readable and melt the film into the page. */}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--graphite-950)_0%,rgb(7_7_9/0.86)_30%,rgb(7_7_9/0.35)_62%,rgb(7_7_9/0.55)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,var(--graphite-950)_0%,rgb(7_7_9/0.2)_38%,transparent_60%,rgb(7_7_9/0.5)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(60rem_34rem_at_80%_40%,rgb(139_92_255/0.18),transparent_70%)] mix-blend-screen" />
      {playing && caption && !useVideo && (
        <p className="absolute bottom-[14%] right-5 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-white/75 uppercase backdrop-blur sm:right-10 xl:right-16">
          <span className="size-1.5 rounded-full bg-accent-ink shadow-[0_0_10px_var(--violet-400)]" />
          Real footage · {caption}
          <span className="text-white/40">
            {String(showing + 1).padStart(2, "0")}/{String(shots.length).padStart(2, "0")}
          </span>
        </p>
      )}
    </motion.div>
  );
}

/** Skip while it plays, Replay after. Keyboard: Escape also skips. */
export function IntroControls() {
  const current = useIntroPhase();
  // Skip/Replay need the client clock; render a placeholder of the same height until hydrated.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  if (!ready) return <span className="h-9" aria-hidden />;
  return current === "playing" ? (
    <button
      type="button"
      onClick={finishIntro}
      className="group relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full border border-white/15 bg-black/40 px-4 text-[13px] font-medium text-ink backdrop-blur transition-[border-color,transform] duration-200 hover:border-white/30 active:scale-[0.97]"
    >
      <span aria-hidden className="intro-progress absolute inset-y-0 left-0 bg-accent/25" />
      <span className="relative inline-flex items-center gap-2">
        Skip intro <SkipForward className="size-3.5" aria-hidden />
      </span>
    </button>
  ) : (
    <button
      type="button"
      onClick={replayIntro}
      className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-ink-muted transition-[color,transform] duration-200 hover:text-ink active:scale-[0.97]"
    >
      <RotateCcw className="size-3.5" aria-hidden /> Replay intro
    </button>
  );
}

/** Holds the memory cards back while the film plays, then pushes them in. */
export function IntroGate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const current = useIntroPhase();
  const playing = current === "playing";
  return (
    <motion.div
      inert={playing}
      aria-hidden={playing || undefined}
      initial={false}
      animate={playing ? { opacity: 0, scale: reduce ? 1 : 0.94, y: reduce ? 0 : 28, filter: reduce ? "blur(0px)" : "blur(8px)" } : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: reduce ? 0.2 : 0.8, delay: playing ? 0 : 0.15, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
