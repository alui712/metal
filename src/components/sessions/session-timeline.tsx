"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { Moment, Recording, Session } from "@/lib/memory/contracts";
import { formatTime, timecode } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RecordingPlayer } from "@/components/media/demo-player";
import { KIND_META, KindTag } from "@/components/memory/kind";
import { IconButton } from "@/components/ui/button";
import { EASE_OUT } from "@/components/ui/motion";

const TICK_MS = 30 * 60_000;

export function SessionTimeline({
  session,
  recordings,
  moments,
}: {
  session: Session;
  recordings: Recording[];
  /** Chronological across the session. */
  moments: Moment[];
}) {
  const reduce = useReducedMotion();
  const params = useSearchParams();
  const initial = params.get("moment");
  const [selectedId, setSelectedId] = useState(
    moments.some((m) => m.id === initial) ? initial! : session.coverMomentId,
  );
  const detailRef = useRef<HTMLDivElement>(null);

  const recById = useMemo(() => new Map(recordings.map((r) => [r.id, r])), [recordings]);
  const lanes = useMemo(() => {
    const owners = [...new Set(recordings.map((r) => r.ownerLabel))].sort((a, b) =>
      a === "You" ? -1 : b === "You" ? 1 : a.localeCompare(b),
    );
    return owners.map((owner) => ({ owner, recordings: recordings.filter((r) => r.ownerLabel === owner) }));
  }, [recordings]);

  const start = session.startedAt;
  const span = session.endedAt - session.startedAt;
  const pos = (t: number) => `${((t - start) / span) * 100}%`;
  const abs = (m: Moment) => recById.get(m.recordingId)!.recordedAt + m.startMs;

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let t = Math.ceil(start / TICK_MS) * TICK_MS; t < session.endedAt; t += TICK_MS) out.push(t);
    return out;
  }, [start, session.endedAt]);

  const index = Math.max(0, moments.findIndex((m) => m.id === selectedId));
  const selected = moments[index];
  const selectedRec = recById.get(selected.recordingId)!;

  function select(id: string, { scroll = false } = {}) {
    setSelectedId(id);
    // Shareable deep link without a server round-trip.
    const url = new URL(window.location.href);
    url.searchParams.set("moment", id);
    window.history.replaceState(null, "", url);
    if (scroll) detailRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  function step(delta: number) {
    const next = moments[index + delta];
    if (next) select(next.id);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`[data-marker="${moments[Math.max(0, Math.min(moments.length - 1, index + (e.key === "ArrowRight" ? 1 : -1)))].id}"]`)?.focus(),
      );
    }
  }

  return (
    <div>
      {/* ── Timeline ─────────────────────────────────────── */}
      <section aria-labelledby="timeline-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 id="timeline-heading" className="text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">
            The night, minute by minute
          </h2>
          <p className="hidden text-[12.5px] text-ink-faint sm:block">← → to step through moments</p>
        </div>
        <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" onKeyDown={onKeyDown}>
          <div className="min-w-[760px] rounded-3xl border border-line bg-surface-2/60 p-5 sm:p-6">
            {/* Ticks */}
            <div className="relative ml-20 h-6">
              {ticks.map((t) => (
                <span key={t} className="absolute -translate-x-1/2 font-mono text-[11px] text-ink-faint" style={{ left: pos(t) }}>
                  {formatTime(t)}
                </span>
              ))}
            </div>
            <div className="relative mt-2">
              {/* Gridlines */}
              <div aria-hidden className="pointer-events-none absolute inset-y-0 left-20 right-0">
                {ticks.map((t) => (
                  <span key={t} className="absolute inset-y-0 w-px bg-line" style={{ left: pos(t) }} />
                ))}
              </div>
              {lanes.map((lane) => (
                <div key={lane.owner} className="flex h-[76px] items-start">
                  <span className="w-20 shrink-0 truncate pr-3 pt-[34px] text-[12.5px] font-medium text-ink-muted">
                    {lane.owner === "You" ? "Your POV" : lane.owner}
                  </span>
                  <div className="relative h-full flex-1">
                    {lane.recordings.map((r) => (
                      <div key={r.id} style={{ left: pos(r.recordedAt), width: `${(r.durationMs / span) * 100}%` }} className="absolute inset-y-0">
                        <span className="absolute inset-x-0 top-1.5 truncate px-1 text-[11px] text-ink-faint">{r.title}</span>
                        <span aria-hidden className="absolute inset-x-0 top-[44px] h-7 -translate-y-1/2 rounded-lg border border-line-strong bg-surface-4/70" />
                      </div>
                    ))}
                    {moments
                      .filter((m) => recById.get(m.recordingId)?.ownerLabel === lane.owner)
                      .map((m) => {
                        const isSel = m.id === selected.id;
                        const size = 12 + m.score * 10;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            data-marker={m.id}
                            onClick={() => select(m.id)}
                            aria-label={`${m.title}, ${formatTime(abs(m))}`}
                            aria-pressed={isSel}
                            className="group/m absolute top-[44px] z-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
                            style={{ left: pos(abs(m)) }}
                          >
                            <span
                              className={cn(
                                "block rounded-full border-2 transition-all duration-200 group-hover/m:scale-125",
                                isSel ? "border-white bg-accent shadow-[0_0_0_5px_rgb(139_92_255/0.3)]" : "border-bg bg-ink-muted group-hover/m:bg-ink",
                              )}
                              style={{ width: size, height: size }}
                            />
                            <span
                              className={cn(
                                "pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line-strong bg-surface-3 px-2.5 py-1 text-[12px] font-medium text-ink shadow-lg transition-opacity",
                                isSel ? "opacity-100" : "opacity-0 group-hover/m:opacity-100 group-focus-visible/m:opacity-100",
                              )}
                            >
                              {m.title}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Selected moment ──────────────────────────────── */}
      <section ref={detailRef} aria-label="Selected moment" className="mt-10 grid scroll-mt-6 gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <RecordingPlayer
          key={selectedRec.id}
          recording={selectedRec}
          moments={moments.filter((m) => m.recordingId === selectedRec.id)}
          seek={{ ms: selected.startMs, nonce: index }}
          title={selected.title}
        />
        <div className="flex flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, x: reduce ? 0 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduce ? 0 : -12 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="flex-1"
            >
              <div className="flex items-center gap-3 text-[12.5px] text-ink-faint">
                <KindTag kind={selected.kind} />
                <span>
                  {formatTime(abs(selected))} · {selectedRec.ownerLabel === "You" ? "your POV" : `${selectedRec.ownerLabel}'s POV`} · {timecode(selected.startMs)} in
                </span>
              </div>
              <h3 className="mt-2 text-[clamp(1.5rem,2.6vw,2rem)] font-semibold leading-tight tracking-[-0.025em] text-ink">
                {selected.title}
              </h3>
              <p className="mt-4 flex gap-2.5 text-[14.5px] leading-relaxed text-ink-muted">
                <Eye className="mt-1 size-4 shrink-0 text-ink-faint" aria-label="On screen" />
                {selected.caption}
              </p>
              {selected.transcript.length > 0 && (
                <blockquote className="mt-5 space-y-2 border-l-2 border-accent/50 pl-4">
                  {selected.transcript.map((l) => (
                    <p key={l.tMs} className="text-[15px] leading-relaxed text-ink">
                      <span className="text-ink-faint">{l.speaker}: </span>“{l.text}”
                    </p>
                  ))}
                </blockquote>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="mt-8 flex items-center gap-2 border-t border-line pt-5">
            <IconButton aria-label="Previous moment" onClick={() => step(-1)} disabled={index === 0} className="border border-line">
              <ChevronLeft className="size-5" aria-hidden />
            </IconButton>
            <IconButton aria-label="Next moment" onClick={() => step(1)} disabled={index === moments.length - 1} className="border border-line">
              <ChevronRight className="size-5" aria-hidden />
            </IconButton>
            <span className="ml-2 text-[13px] tabular-nums text-ink-faint">
              Moment {index + 1} of {moments.length}
            </span>
          </div>
        </div>
      </section>

      {/* ── Chapter list ─────────────────────────────────── */}
      <section aria-labelledby="chapters-heading" className="mt-16">
        <h2 id="chapters-heading" className="mb-4 text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          All moments
        </h2>
        <ol className="divide-y divide-line border-y border-line">
          {moments.map((m, i) => {
            const meta = KIND_META[m.kind];
            const Icon = meta.icon;
            const isSel = m.id === selected.id;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => select(m.id, { scroll: true })}
                  aria-current={isSel ? "true" : undefined}
                  className={cn(
                    "group grid w-full grid-cols-[2.5rem_4.5rem_1fr_auto] items-center gap-3 px-2 py-4 text-left transition-colors sm:gap-5",
                    isSel ? "bg-accent/[0.07]" : "hover:bg-surface-2",
                  )}
                >
                  <span className="font-mono text-[12px] text-ink-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-mono text-[12px] tabular-nums text-ink-muted">{formatTime(abs(m))}</span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-[15px] font-medium", isSel ? "text-ink" : "text-ink-muted group-hover:text-ink")}>
                      {m.title}
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-faint">{recById.get(m.recordingId)?.ownerLabel === "You" ? "Your POV" : `${recById.get(m.recordingId)?.ownerLabel}'s POV`}</span>
                  </span>
                  <Icon className={cn("size-4", meta.tone)} aria-label={meta.label} />
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
