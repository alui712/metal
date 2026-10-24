"use client";

import { motion, useReducedMotion } from "motion/react";
import { LogoMark } from "@/components/brand/logo";
import { EASE_OUT } from "@/components/ui/motion";

// The showcase's opening beat: the mark lands, the name resolves letter by
// letter, then the line arrives word by word. About a second in all, never a
// splash screen; the page underneath is usable the whole time.

const LINE_ONE = ["The", "game", "ends."];
const LINE_TWO = ["The", "moment", "doesn’t."];

export function ShowcaseHero() {
  const reduce = useReducedMotion();
  const word = (i: number) => ({
    initial: { opacity: 0, filter: reduce ? "blur(0px)" : "blur(10px)", y: reduce ? 0 : 14 },
    animate: { opacity: 1, filter: "blur(0px)", y: 0 },
    transition: { duration: reduce ? 0.2 : 0.55, delay: reduce ? 0 : 0.45 + i * 0.08, ease: EASE_OUT },
  });

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
            <motion.span key={w} className="mr-[0.24em] inline-block last:mr-0" {...word(i)}>
              {w}
            </motion.span>
          ))}
        </span>
        <span className="mt-2 block font-display text-[clamp(3rem,5.6vw,6.75rem)] font-normal italic leading-[0.95] tracking-[-0.015em]">
          {LINE_TWO.map((w, i) => (
            <motion.span
              key={w}
              className="mr-[0.22em] inline-block bg-[linear-gradient(105deg,var(--violet-300)_10%,var(--violet-400)_55%,var(--violet-500))] bg-clip-text pr-[0.06em] text-transparent last:mr-0"
              {...word(i + LINE_ONE.length + 1)}
            >
              {w}
            </motion.span>
          ))}
        </span>
      </h1>
    </div>
  );
}
