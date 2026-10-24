"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Fade-and-rise entrance. Reduced motion: opacity only. */
export function Reveal({
  delay = 0,
  y = 16,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.2 : 0.7, delay: reduce ? 0 : delay, ease: EASE_OUT }}
      {...props}
    />
  );
}

/** Reveals when scrolled into view (once). */
export function InView({
  delay = 0,
  y = 20,
  ...props
}: HTMLMotionProps<"div"> & { delay?: number; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: reduce ? 0.2 : 0.7, delay: reduce ? 0 : delay, ease: EASE_OUT }}
      {...props}
    />
  );
}
