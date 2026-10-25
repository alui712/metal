"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
/** After the intro, each approved shot holds this long before the next crossfades in. */
const AMBIENT_MS = 3500;
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

/**
 * Full-bleed reel behind the hero. The intro is its fast opening (three approved shots,
 * or the montage video); afterwards the same reel keeps cycling through every approved
 * recording at an ambient pace. Server-rendered on its first frame: never a blank paint.
 */
export function IntroFilm({ shots, video, introCount }: { shots: IntroShot[]; video: IntroVideo | null; introCount: number }) {
  const reduce = useReducedMotion();
  const current = useIntroPhase();
  const take = useTake();
  const root = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const [useVideo, setUseVideo] = useState(Boolean(video));
  // `seq` counts cuts; the visible shot is seq % n, crossfading over `from` (the shot before it).
  const [seq, setSeq] = useState(0);
  const [from, setFrom] = useState<number | null>(null);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const n = shots.length;
  const cur = n ? seq % n : 0;
  const prev = from !== null && from !== cur ? from : null;
  const next = n > 1 ? (seq + 1) % n : null;

  // First visit in this tab plays; later visits (and reduced motion) start on the cards.
  useEffect(() => {
    document.documentElement.removeAttribute("data-dive"); // back from a Memory Dive
    document.querySelector("[data-dive-target]")?.removeAttribute("data-dive-target");
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

  // One 16:9 presentation: fill the stage when it's close to 16:9, otherwise show the whole
  // frame over a soft fill of itself instead of cropping hard (phones, ultrawide).
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect.width / Math.max(1, e.contentRect.height);
      setFit(Math.abs(r / (16 / 9) - 1) < 0.15 ? "cover" : "contain");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Replay crossfades from whatever is on screen back to the first shot (always mounted).
  const [introStart, setIntroStart] = useState(0);
  const [lastTake, setLastTake] = useState(take);
  if (take !== lastTake) {
    setLastTake(take);
    const to = n ? seq + ((n - cur) % n || n) : seq;
    setFrom(cur);
    setSeq(to);
    setIntroStart(to);
  }

  // The clock: runs only while most of the reel is on screen and the tab is visible.
  // Reduced motion: only a replay the viewer asked for moves; nothing cycles on its own.
  const playing = current === "playing";
  const runs = n > 0 && (playing || !reduce);
  useEffect(() => {
    if (!runs) return;
    const el = root.current;
    let visible = true;
    let elapsed = 0;
    let last = performance.now();
    let raf = 0;
    const io = new IntersectionObserver(([e]) => (visible = e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] });
    if (el) io.observe(el);
    const v = playing && useVideo ? player.current : null;
    if (v) {
      v.currentTime = 0;
      void v.play().catch(() => setUseVideo(false));
    }
    const tick = (now: number) => {
      const on = visible && document.visibilityState === "visible";
      el?.toggleAttribute("data-paused", !on);
      if (on) elapsed += now - last;
      last = now;
      if (v) {
        if (!on && !v.paused) v.pause();
        else if (on && v.paused && !v.ended) void v.play().catch(() => {});
        if (v.ended || elapsed > MAX_VIDEO_MS) return finishIntro();
      } else if (elapsed >= (playing ? SHOT_MS : AMBIENT_MS)) {
        elapsed = 0;
        if (playing && seq - introStart >= introCount - 1) return finishIntro();
        if (n > 1) {
          setFrom(cur);
          return setSeq(seq + 1);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      v?.pause();
    };
  }, [runs, playing, seq, cur, introStart, introCount, useVideo, n]);

  if (!n && !video) return null;
  const caption = shots[cur]?.caption;
  const shown = new Set([0, cur, prev, next].filter((i): i is number => i !== null && i < n));

  return (
    <motion.div
      ref={root}
      aria-hidden
      className="intro-film pointer-events-none absolute inset-x-0 top-0 -z-[5] h-[min(100dvh,72rem)] overflow-hidden bg-[var(--graphite-950)]"
      initial={false}
      animate={{ opacity: playing ? 1 : 0.62 }}
      transition={{ duration: reduce ? 0.2 : 0.9, ease: EASE_OUT }}
    >
      {shots.map((s, i) =>
        shown.has(i) ? (
          <div
            key={s.id}
            data-live={i === cur || i === prev ? "" : undefined}
            className={cn("intro-shot absolute inset-0", i === cur ? "z-[2] opacity-100" : i === prev ? "z-[1] opacity-100" : "z-0 opacity-0")}
          >
            {fit === "contain" && (
              // eslint-disable-next-line @next/next/no-img-element -- approved local poster
              <img src={s.imageUrl} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-45 blur-2xl" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- approved local poster */}
            <img
              src={s.imageUrl}
              alt=""
              decoding="async"
              fetchPriority={i === 0 ? "high" : "low"}
              className={cn("intro-drift absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain object-[50%_30%]")}
            />
          </div>
        ) : null,
      )}
      <AnimatePresence>
        {video && useVideo && playing && (
          <motion.video
            key="montage"
            exit={{ opacity: 0, transition: { duration: 0.9, ease: EASE_OUT } }}
            ref={player}
            src={video.src}
            poster={video.poster ?? shots[0]?.imageUrl}
            muted
            playsInline
            preload="auto"
            onError={() => setUseVideo(false)}
            className="absolute inset-0 z-[3] size-full object-cover"
          />
        )}
      </AnimatePresence>
      {/* Lighting: a dark left side for the headline, a dark top that hides game HUDs (player names), a vignette, then the page. */}
      <div className="absolute inset-0 z-[4] bg-[linear-gradient(90deg,var(--graphite-950)_0%,rgb(7_7_9/0.86)_30%,rgb(7_7_9/0.3)_62%,rgb(7_7_9/0.45)_100%)]" />
      <div className="absolute inset-0 z-[4] bg-[linear-gradient(to_top,var(--graphite-950)_0%,rgb(7_7_9/0.2)_38%,transparent_55%,rgb(7_7_9/0.75)_86%,var(--graphite-950)_100%)]" />
      <div className="absolute inset-0 z-[4] bg-[radial-gradient(ellipse_at_60%_45%,transparent_45%,rgb(7_7_9/0.55)_100%)]" />
      <div className="absolute inset-0 z-[4] bg-[radial-gradient(60rem_34rem_at_80%_40%,rgb(139_92_255/0.16),transparent_70%)] mix-blend-screen" />
      {playing && caption && !(video && useVideo) && (
        // Keyed per shot: a new chip replaces the old one rather than reflowing it.
        <p key={seq} className="absolute bottom-[14%] right-5 z-[5] flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 font-mono text-[11px] tracking-[0.14em] text-white/75 uppercase backdrop-blur sm:right-10 xl:right-16">
          <span className="size-1.5 rounded-full bg-accent-ink shadow-[0_0_10px_var(--violet-400)]" />
          Real footage · {caption}
          <span className="text-white/40">
            {String(Math.min(seq - introStart, introCount - 1) + 1).padStart(2, "0")}/{String(introCount).padStart(2, "0")}
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
