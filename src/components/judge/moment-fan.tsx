"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Play } from "lucide-react";
import { EASE_OUT } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

// Fanned stack of real gameplay frames. Hover or focus plays the footage
// behind the card, muted, from `startMs`; nothing autoplays with sound.

export type FanCard = {
  id: string;
  href: string;
  imageUrl: string;
  videoUrl: string | null;
  startMs: number;
  title: string;
  detail: string;
  label: string;
};

const FAN = [
  { left: "0%", top: "20%", rotate: -8, z: 1 },
  { left: "36%", top: "2%", rotate: 6, z: 2 },
  { left: "14%", top: "38%", rotate: -1.5, z: 3 },
] as const;

export function MomentFan({ cards, delay = 0.35 }: { cards: FanCard[]; delay?: number }) {
  const shown = cards.slice(0, 3);
  return (
    <>
      <div className="relative hidden aspect-[1.08] w-full lg:block">
        {shown.map((c, i) => (
          <Card key={c.id} card={c} fan={FAN[(i + FAN.length - shown.length) % FAN.length]} order={i} delay={delay} />
        ))}
      </div>
      <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:hidden">
        {shown.map((c, i) => (
          <li key={c.id} className="w-[min(82vw,26rem)] shrink-0 snap-start">
            <Card card={c} order={i} delay={delay} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Card({ card: c, fan, order, delay }: { card: FanCard; fan?: (typeof FAN)[number]; order: number; delay: number }) {
  const reduce = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const start = () => {
    const v = video.current;
    if (!v || reduce) return;
    v.currentTime = c.startMs / 1000;
    v.play().then(() => setPlaying(true), () => setPlaying(false));
  };
  const stop = () => {
    video.current?.pause();
    setPlaying(false);
  };

  return (
    <motion.div
      className={cn(fan ? "absolute w-[64%]" : "w-full")}
      style={fan ? { left: fan.left, top: fan.top, zIndex: fan.z } : undefined}
      initial={{ opacity: 0, y: reduce ? 0 : 70, rotate: 0, scale: reduce ? 1 : 0.92 }}
      animate={{ opacity: 1, y: 0, rotate: fan?.rotate ?? 0, scale: 1 }}
      whileHover={reduce || !fan ? undefined : { rotate: 0, scale: 1.05, y: -8, zIndex: 10, transition: { duration: 0.35, ease: EASE_OUT } }}
      transition={{ duration: reduce ? 0.2 : 0.9, delay: reduce ? 0 : delay + order * 0.12, ease: EASE_OUT }}
    >
      <Link
        href={c.href}
        aria-label={c.label}
        onMouseEnter={start}
        onMouseLeave={stop}
        onFocus={start}
        onBlur={stop}
        className="group block overflow-hidden rounded-2xl border border-white/10 bg-surface-2 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.95)] ring-accent/60 transition-[box-shadow,border-color] duration-300 hover:border-accent/50 hover:ring-2 focus-visible:ring-2"
      >
        <span className="relative block aspect-video overflow-hidden bg-surface-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local keyframe */}
          <img src={c.imageUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
          {c.videoUrl && (
            <video
              ref={video}
              src={c.videoUrl}
              muted
              playsInline
              preload="none"
              aria-hidden
              className={cn("absolute inset-0 size-full object-cover transition-opacity duration-500", playing ? "opacity-100" : "opacity-0")}
            />
          )}
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </span>
        <span className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-3">
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-semibold text-ink">{c.title}</span>
            <span className="mt-0.5 block truncate font-mono text-[11.5px] tracking-wide text-ink-faint">
              {c.detail}
              {c.detail && " · "}
              <PlayHint lower />
            </span>
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-4 text-ink transition-colors group-hover:bg-accent group-hover:text-white">
            <Play className="size-3.5 fill-current" aria-hidden />
          </span>
        </span>
      </Link>
    </motion.div>
  );
}

/** "Hover to play" only where hovering exists; touch screens open the recording on tap. */
export function PlayHint({ lower = false }: { lower?: boolean }) {
  return (
    <>
      <span className="[@media(hover:none)]:hidden">{lower ? "hover to play" : "Hover to play."}</span>
      <span className="hidden [@media(hover:none)]:inline">{lower ? "tap to open" : "Tap one to open it."}</span>
    </>
  );
}
