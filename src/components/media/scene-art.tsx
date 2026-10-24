"use client";

import { useId } from "react";
import type { ArtSpec } from "@/lib/memory/contracts";
import { cn } from "@/lib/cn";

// Procedural poster art for demo fixtures (original artwork, no game assets).
// Deterministic for a given spec so server and client render identically.

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Fresh generator per scene, so every render (including React's dev double-render) draws the same art. */
const seeded = (art: ArtSpec) => rng(art.seed * 9973 + art.hue);

const hsl = (h: number, s: number, l: number, a = 1) =>
  `hsl(${((h % 360) + 360) % 360} ${s}% ${l}% / ${a})`;

/** Jagged silhouette path across the full width. */
function ridgePath(rand: () => number, baseY: number, amp: number, steps: number, w = 160, h = 90) {
  let d = `M0 ${h} L0 ${baseY}`;
  for (let i = 1; i <= steps; i++) {
    const x = (i / steps) * w;
    const y = baseY - rand() * amp + amp / 3;
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return `${d} L${w} ${h} Z`;
}

function Ridge({ art, ids, snowy }: SceneProps & { snowy?: boolean }) {
  const h = art.hue;
  const rand = seeded(art);
  return (
    <>
      <rect width="160" height="90" fill={`url(#${ids.sky})`} />
      <circle cx={30 + rand() * 100} cy={snowy ? 30 : 46} r={snowy ? 9 : 14} fill={hsl(h + 20, 90, snowy ? 92 : 70, snowy ? 0.55 : 0.9)} filter={`url(#${ids.glow})`} />
      {[0, 1, 2, 3].map((i) => (
        <path
          key={i}
          d={ridgePath(rand, 48 + i * 10, 18 - i * 2, 9 + i * 4)}
          fill={hsl(h + (snowy ? 0 : -8 * i), snowy ? 25 : 45 - i * 6, snowy ? 62 - i * 15 : 26 - i * 6)}
        />
      ))}
      {snowy &&
        Array.from({ length: 40 }, (_, i) => (
          <circle key={i} cx={rand() * 160} cy={rand() * 90} r={rand() * 0.5 + 0.15} fill="white" opacity={rand() * 0.6 + 0.2} />
        ))}
      {!snowy &&
        Array.from({ length: 22 }, (_, i) => (
          <circle key={i} cx={rand() * 160} cy={40 + rand() * 50} r={rand() * 0.6 + 0.2} fill={hsl(h + 15, 100, 65)} opacity={rand() * 0.8} />
        ))}
    </>
  );
}

function City({ art, ids }: SceneProps) {
  const h = art.hue;
  const rand = seeded(art);
  const buildings = Array.from({ length: 18 }, (_, i) => {
    const w = 6 + rand() * 9;
    const x = (i / 18) * 170 - 5;
    const height = 18 + rand() * 46;
    return { x, w, height };
  });
  return (
    <>
      <rect width="160" height="90" fill={`url(#${ids.sky})`} />
      <ellipse cx="80" cy="62" rx="90" ry="22" fill={hsl(h, 90, 55, 0.25)} filter={`url(#${ids.glow})`} />
      {buildings.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={90 - b.height - 14} width={b.w} height={b.height + 14} fill={hsl(h - 60, 30, 8 + (i % 3) * 2)} />
          {Array.from({ length: Math.floor(b.height / 5) }, (_, j) =>
            rand() > 0.55 ? (
              <rect key={j} x={b.x + 1.5 + (j % 2) * (b.w / 2 - 1)} y={90 - b.height - 10 + j * 5} width="1.4" height="1.6" fill={rand() > 0.7 ? hsl(h, 95, 72) : hsl(h - 140, 90, 70)} opacity="0.85" />
            ) : null,
          )}
        </g>
      ))}
      <rect y="76" width="160" height="14" fill={hsl(h - 60, 30, 5)} />
      <path d="M0 83 Q80 76 160 83" stroke={hsl(h, 100, 65)} strokeWidth="0.8" fill="none" opacity="0.9" filter={`url(#${ids.glow})`} />
      <path d="M0 87 Q80 81 160 87" stroke={hsl(h - 140, 100, 65)} strokeWidth="0.5" fill="none" opacity="0.7" />
    </>
  );
}

function Arena({ art, ids }: SceneProps) {
  const h = art.hue;
  const rand = seeded(art);
  const horizon = 46 + rand() * 6;
  return (
    <>
      <rect width="160" height="90" fill={`url(#${ids.sky})`} />
      <rect y={horizon} width="160" height={90 - horizon} fill={hsl(h, 35, 8)} />
      {Array.from({ length: 17 }, (_, i) => {
        const x = -80 + i * 20;
        return <line key={`v${i}`} x1={80} y1={horizon} x2={x * 2 + 80} y2={90} stroke={hsl(h, 85, 60, 0.5)} strokeWidth="0.3" />;
      })}
      {Array.from({ length: 8 }, (_, i) => {
        const y = horizon + Math.pow(i / 8, 2) * (90 - horizon);
        return <line key={`h${i}`} x1={0} y1={y} x2={160} y2={y} stroke={hsl(h, 80, 55, 0.3)} strokeWidth="0.3" />;
      })}
      {Array.from({ length: 5 }, (_, i) => {
        const x = 10 + rand() * 140;
        const w = 6 + rand() * 18;
        const hh = 6 + rand() * 14;
        return <rect key={i} x={x} y={horizon - hh} width={w} height={hh} fill={hsl(h - 10, 25, 10)} />;
      })}
      <line x1="0" y1={horizon} x2="160" y2={horizon} stroke={hsl(h, 100, 70)} strokeWidth="0.6" filter={`url(#${ids.glow})`} />
      <ellipse cx={40 + rand() * 80} cy={horizon - 4} rx="60" ry="12" fill={hsl(h, 90, 60, 0.22)} filter={`url(#${ids.glow})`} />
    </>
  );
}

function Orbit({ art, ids }: SceneProps) {
  const h = art.hue;
  const rand = seeded(art);
  const cx = 20 + rand() * 120;
  return (
    <>
      <rect width="160" height="90" fill={`url(#${ids.sky})`} />
      <ellipse cx={160 - cx} cy="30" rx="50" ry="20" fill={hsl(h + 120, 70, 45, 0.18)} filter={`url(#${ids.glow})`} />
      {Array.from({ length: 70 }, (_, i) => (
        <circle key={i} cx={rand() * 160} cy={rand() * 90} r={rand() * 0.45 + 0.1} fill="white" opacity={rand() * 0.8 + 0.1} />
      ))}
      <circle cx={cx} cy="128" r="70" fill={hsl(h, 45, 14)} />
      <circle cx={cx} cy="128" r="70" fill="none" stroke={hsl(h, 90, 70)} strokeWidth="0.7" opacity="0.9" filter={`url(#${ids.glow})`} />
      <ellipse cx={cx} cy="70" rx="95" ry="8" fill="none" stroke={hsl(h + 30, 60, 70, 0.35)} strokeWidth="0.5" />
      <path d={`M${cx + 30} 40 l1.5 -0.6 l1.5 0.6 l-1.5 0.6 z`} fill={hsl(h + 20, 100, 80)} />
    </>
  );
}

type SceneProps = {
  art: ArtSpec;
  ids: { sky: string; glow: string; vignette: string };
};

export function SceneArt({
  art,
  className,
  label,
}: {
  art: ArtSpec;
  className?: string;
  /** Accessible description; omit when decorative. */
  label?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids = { sky: `sky${uid}`, glow: `glow${uid}`, vignette: `vig${uid}` };
  const h = art.hue;
  const skyStops: Record<ArtSpec["variant"], [string, string]> = {
    city: [hsl(h - 70, 60, 6), hsl(h, 60, 22)],
    ridge: [hsl(h - 10, 50, 10), hsl(h + 15, 80, 38)],
    peaks: [hsl(h + 10, 45, 12), hsl(h - 10, 35, 46)],
    arena: [hsl(h - 30, 45, 6), hsl(h, 55, 22)],
    orbit: [hsl(h + 40, 50, 3), hsl(h, 50, 10)],
  };
  const [top, bottom] = skyStops[art.variant];
  const props = { art, ids };

  return (
    <svg
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid slice"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("block size-full", className)}
    >
      <defs>
        <linearGradient id={ids.sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <filter id={ids.glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <radialGradient id={ids.vignette} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="black" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity="0.65" />
        </radialGradient>
      </defs>
      {art.variant === "city" && <City {...props} />}
      {art.variant === "ridge" && <Ridge {...props} />}
      {art.variant === "peaks" && <Ridge {...props} snowy />}
      {art.variant === "arena" && <Arena {...props} />}
      {art.variant === "orbit" && <Orbit {...props} />}
      <rect width="160" height="90" fill={`url(#${ids.vignette})`} />
    </svg>
  );
}
