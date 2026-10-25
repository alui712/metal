"use client";

import { motion, useReducedMotion } from "motion/react";
import { LogoMark } from "@/components/brand/logo";
import { EASE_OUT } from "@/components/ui/motion";

// The showcase's opening beat: the mark lands, the name resolves letter by
// letter, then each line rises word by word out of its own mask, the second a
// beat after the first. Transforms only (no layout shift); about 1.2 s in all,
// never a splash screen. Reduced motion: a plain fade.

const LINE_ONE = ["The", "game", "ends."];
const LINE_TWO = ["The", "moment", "doesn’t."];

export function ShowcaseHero() {
  const reduce = useReducedMotion();

  return (
    <div>
      <div className="flex items-center gap-4">
        <motion.span
          className="relative grid place-items-center"
          initial={{ opacity: 0, scale: reduce ? 1 : 0.6, rotate: reduce ? 0 : -24, filter: reduce ? "blur(0px)" : "blur(12px)" }}
          animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
          transition={{ duration: reduce ? 0.2 : 0.8, ease: EASE_OUT }}
        >
          <span aria-hidden className="absolute size-24 rounded-full bg-accent/45 blur-2xl" />
          <LogoMark className="relative size-14 drop-shadow-[0_8px_30px_rgb(139_92_255/0.55)]" />
        </motion.span>
        <span className="flex text-[22px] font-semibold tracking-[0.34em] text-ink" aria-label="METAL">
          {"METAL".split("").map((ch, i) => (
            <motion.span
              key={i}
              aria-hidden
              initial={{ opacity: 0, filter: reduce ? "blur(0px)" : "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: reduce ? 0.2 : 0.35, delay: reduce ? 0 : 0.2 + i * 0.06, ease: EASE_OUT }}
            >
              {ch}
            </motion.span>
          ))}
        </span>
      </div>

      <h1 className="mt-10 uppercase">
        <span className="block text-[clamp(2.75rem,4.9vw,6rem)] font-bold leading-[0.92] tracking-[-0.045em] text-ink">
          {LINE_ONE.map((w, i) => (
            <Word key={w} reduce={reduce} delay={0.3 + i * 0.075} className="mr-[0.24em] last:mr-0">
              {w}
            </Word>
          ))}
        </span>
        {/* Follows the first line, then one slow sweep of light: emphasis, not a shimmer. */}
        <span className="mt-2 block font-display text-[clamp(3rem,5.6vw,6.75rem)] font-normal italic leading-[0.95] tracking-[-0.015em]">
          {LINE_TWO.map((w, i) => (
            <Word key={w} reduce={reduce} delay={0.72 + i * 0.09} className="mr-[0.22em] last:mr-0" italic>
              <span className="headline-violet bg-clip-text pr-[0.06em] text-transparent" style={{ animationDelay: `${1.35 + i * 0.12}s` }}>
                {w}
              </span>
            </Word>
          ))}
        </span>
      </h1>
    </div>
  );
}

/** One word rising out of a mask. The mask is padded so italic overhangs and descenders aren't clipped. */
function Word({ children, delay, reduce, className, italic = false }: { children: React.ReactNode; delay: number; reduce: boolean | null; className?: string; italic?: boolean }) {
  return (
    <span className={`inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom ${italic ? "pr-[0.08em] -mr-[0.08em]" : ""} ${className ?? ""}`}>
      <motion.span
        className="inline-block"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: "105%", rotate: italic ? 2 : 0 }}
        animate={{ opacity: 1, y: "0%", rotate: 0 }}
        transition={reduce ? { duration: 0.3 } : { y: { duration: 0.85, delay, ease: EASE_OUT }, rotate: { duration: 0.85, delay, ease: EASE_OUT }, opacity: { duration: 0.4, delay } }}
      >
        {children}
      </motion.span>
    </span>
  );
}
