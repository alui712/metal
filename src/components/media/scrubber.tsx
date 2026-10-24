"use client";

import { timecode } from "@/lib/format";
import { cn } from "@/lib/cn";

export type ScrubMarker = {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
};

/**
 * Accessible timeline scrubber: a native range input (keyboard + screen
 * readers) layered over a custom track with moment markers.
 */
export function Scrubber({
  timeMs,
  durationMs,
  onSeek,
  markers = [],
  activeMarkerId,
  label = "Seek",
  className,
}: {
  timeMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
  markers?: ScrubMarker[];
  activeMarkerId?: string | null;
  label?: string;
  className?: string;
}) {
  const pct = durationMs ? (timeMs / durationMs) * 100 : 0;
  return (
    <div className={cn("group/scrub relative h-6 w-full rounded-full has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-accent has-[input:focus-visible]:ring-offset-4 has-[input:focus-visible]:ring-offset-surface", className)}>
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/15 transition-[height] group-hover/scrub:h-1.5">
        {markers.map((m) => (
          <span
            key={m.id}
            className={cn(
              "absolute inset-y-0 rounded-full",
              m.id === activeMarkerId ? "bg-accent-ink" : "bg-white/35",
            )}
            style={{
              left: `${(m.startMs / durationMs) * 100}%`,
              width: `max(4px, ${((m.endMs - m.startMs) / durationMs) * 100}%)`,
            }}
          />
        ))}
        <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgb(139_92_255/0.35)] transition-transform group-hover/scrub:scale-110"
        style={{ left: `${pct}%` }}
      />
      <input
        type="range"
        min={0}
        max={durationMs}
        step={1000}
        value={Math.round(timeMs)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={`${timecode(timeMs)} of ${timecode(durationMs)}`}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </div>
  );
}
