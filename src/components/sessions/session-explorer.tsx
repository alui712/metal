"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Clapperboard, Film } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ViewTransition, useEffect, useMemo, useRef, useState } from "react";
import type { Game, Session } from "@/lib/memory/contracts";
import { duration, formatDay, formatLongDate, formatMonth, formatShortMonth, formatTime, plural } from "@/lib/format";
import { cn } from "@/lib/cn";
import { SceneArt } from "@/components/media/scene-art";
import { sessionArtName } from "@/components/memory/cards";
import { buttonClass } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/controls";
import { EASE_OUT } from "@/components/ui/motion";
import { FriendStack } from "./friends";

export type ExplorerSession = Session & { momentCount: number; recordingCount: number };

export function SessionExplorer({ sessions, games }: { sessions: ExplorerSession[]; games: Game[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const [gameIds, setGameIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState(sessions[0]?.id);
  const ribbonRef = useRef<HTMLDivElement>(null);

  // Ribbon reads left → right in time: oldest first.
  const visible = useMemo(
    () =>
      sessions
        .filter((s) => !gameIds.length || gameIds.includes(s.gameId))
        .sort((a, b) => a.startedAt - b.startedAt),
    [sessions, gameIds],
  );
  const selected = visible.find((s) => s.id === selectedId) ?? visible.at(-1);
  const months = useMemo(() => [...new Set(visible.map((s) => formatMonth(s.startedAt)))], [visible]);

  useEffect(() => {
    if (!selected) return;
    ribbonRef.current
      ?.querySelector<HTMLElement>(`[data-session="${selected.id}"]`)
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", inline: "center", block: "nearest" });
  }, [selected, reduce]);

  function onRibbonKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const i = visible.findIndex((s) => s.id === selected.id);
    let next: ExplorerSession | undefined;
    if (e.key === "ArrowRight") next = visible[i + 1];
    else if (e.key === "ArrowLeft") next = visible[i - 1];
    else if (e.key === "Home") next = visible[0];
    else if (e.key === "End") next = visible.at(-1);
    else if (e.key === "Enter") {
      e.preventDefault();
      router.push(`/sessions/${selected.id}`, { transitionTypes: ["nav-forward"] });
      return;
    } else return;
    e.preventDefault();
    if (next) {
      setSelectedId(next.id);
      requestAnimationFrame(() =>
        ribbonRef.current?.querySelector<HTMLElement>(`[data-session="${next.id}"]`)?.focus(),
      );
    }
  }

  if (!selected) {
    return (
      <div className="rounded-3xl border border-dashed border-line-strong px-6 py-20 text-center">
        <Film className="mx-auto size-8 text-ink-faint" strokeWidth={1.5} aria-hidden />
        <p className="mt-4 text-[17px] font-medium text-ink">No sessions for these games</p>
        <button type="button" onClick={() => setGameIds([])} className={buttonClass("secondary", "md", "mt-6")}>
          Show all games
        </button>
      </div>
    );
  }

  const game = gameById.get(selected.gameId);

  return (
    <div>
      {/* ── Stage ─────────────────────────────────────────── */}
      <section aria-live="polite" aria-label="Selected session" className="relative isolate overflow-hidden rounded-[28px] ring-1 ring-line">
        <div className="relative aspect-[4/5] sm:aspect-[16/9] lg:aspect-[21/9]">
          <AnimatePresence initial={false}>
            <motion.div
              key={selected.id}
              className="absolute inset-0"
              initial={{ opacity: 0, scale: reduce ? 1 : 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.2 : 0.9, ease: EASE_OUT }}
            >
              <ViewTransition name={sessionArtName(selected.id)} share="morph" default="none">
                <div className="absolute inset-0">
                  <SceneArt art={selected.art} />
                </div>
              </ViewTransition>
            </motion.div>
          </AnimatePresence>
          <div aria-hidden className="grain absolute inset-0" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent sm:bg-gradient-to-r sm:from-black/90 sm:via-black/45" />

          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 lg:p-14">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: reduce ? 0 : 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduce ? 0 : -8 }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
                className="max-w-2xl"
              >
                <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-white/60">
                  {game?.name} · {formatLongDate(selected.startedAt)}
                </p>
                <h2 className="mt-3 text-[clamp(2rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-white">
                  {selected.title}
                </h2>
                <p className="mt-4 line-clamp-3 max-w-xl text-[15px] leading-relaxed text-white/70 sm:line-clamp-2">
                  {selected.summary}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-white/60">
                  <FriendStack names={["You", ...selected.friends]} />
                  <span>
                    {formatTime(selected.startedAt)} – {formatTime(selected.endedAt)} · {duration(selected.endedAt - selected.startedAt)}
                  </span>
                  <span>
                    {plural(selected.recordingCount, "recording")} · {plural(selected.momentCount, "moment")}
                  </span>
                </div>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href={`/sessions/${selected.id}`} transitionTypes={["nav-forward"]} className={buttonClass("primary", "md")}>
                    Open session <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <Link href={`/sessions/${selected.id}/relive`} className={buttonClass("secondary", "md", "bg-black/40 backdrop-blur")}>
                    <Clapperboard className="size-4" aria-hidden />
                    Relive this night
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ── Navigation: games + months ─────────────────────── */}
      <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by game">
          {games.map((g) => (
            <FilterChip
              key={g.id}
              pressed={gameIds.includes(g.id)}
              onPressedChange={(on) => setGameIds((ids) => (on ? [...ids, g.id] : ids.filter((x) => x !== g.id)))}
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: `hsl(${g.art.hue} 80% 60%)` }} />
              {g.name}
            </FilterChip>
          ))}
        </div>
        <nav aria-label="Jump to month" className="flex gap-1">
          {months.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                const first = visible.find((s) => formatMonth(s.startedAt) === m);
                if (first) setSelectedId(first.id);
              }}
              className={cn(
                "h-9 rounded-lg px-3 text-[13px] font-medium transition-colors",
                formatMonth(selected.startedAt) === m ? "bg-surface-3 text-ink" : "text-ink-faint hover:text-ink-muted",
              )}
            >
              {m}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Chronological ribbon ────────────────────────────── */}
      <div
        ref={ribbonRef}
        role="listbox"
        aria-label="Sessions, oldest to newest. Use arrow keys to move, Enter to open."
        aria-orientation="horizontal"
        aria-activedescendant={undefined}
        onKeyDown={onRibbonKeyDown}
        className="scrollbar-none relative -mx-4 mt-6 overflow-x-auto px-4 pb-4 pt-2 sm:-mx-8 sm:px-8"
      >
        <div className="relative flex min-w-max gap-4">
          {/* Axis */}
          <div aria-hidden className="absolute inset-x-0 top-[calc(100%-22px)] h-px bg-line-strong" />
          {visible.map((s, i) => {
            const isSelected = s.id === selected.id;
            const newMonth = i === 0 || formatMonth(visible[i - 1].startedAt) !== formatMonth(s.startedAt);
            return (
              <div key={s.id} className="flex items-end gap-4">
                {newMonth && (
                  <span aria-hidden className="mb-1 self-end pb-6 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-faint [writing-mode:vertical-rl] rotate-180">
                    {formatShortMonth(s.startedAt)}
                  </span>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  data-session={s.id}
                  onClick={() => setSelectedId(s.id)}
                  onDoubleClick={() => router.push(`/sessions/${s.id}`, { transitionTypes: ["nav-forward"] })}
                  className="group flex w-56 flex-col items-stretch text-left sm:w-64"
                >
                  <motion.span
                    animate={{ y: isSelected && !reduce ? -6 : 0 }}
                    transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                    className={cn(
                      "relative block aspect-[16/10] overflow-hidden rounded-2xl ring-1 transition-[box-shadow,opacity] duration-300",
                      isSelected ? "ring-accent/70 shadow-[0_18px_40px_-18px_var(--violet-500)]" : "opacity-70 ring-line group-hover:opacity-100",
                    )}
                  >
                    <SceneArt art={s.art} />
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <span className="absolute inset-x-3 bottom-2.5">
                      <span className="block truncate text-[14px] font-semibold text-white">{s.title}</span>
                      <span className="block truncate text-[12px] text-white/60">{gameById.get(s.gameId)?.name}</span>
                    </span>
                  </motion.span>
                  <span className="mt-3 flex items-center gap-2 pl-1">
                    <span
                      aria-hidden
                      className={cn(
                        "relative z-10 size-3 rounded-full border-2 transition-colors",
                        isSelected ? "border-accent bg-accent shadow-[0_0_0_4px_rgb(139_92_255/0.25)]" : "border-line-strong bg-bg",
                      )}
                    />
                    <span className={cn("text-[12px] tabular-nums", isSelected ? "text-ink" : "text-ink-faint")}>
                      {formatShortMonth(s.startedAt)} {formatDay(s.startedAt)}
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-faint">
        Tip: focus the timeline and use ← → to travel, Enter to open.
      </p>
    </div>
  );
}
