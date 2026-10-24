"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowRight, LayoutGrid, List, Search, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Game, Moment, Recording, Session } from "@/lib/memory/contracts";
import { duration, fileSize, formatDate, formatLongDate, formatMonth, formatTime, plural, timecode } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RecordingPlayer, type SeekRequest } from "@/components/media/demo-player";
import { SceneArt } from "@/components/media/scene-art";
import { KindTag } from "@/components/memory/kind";
import { buttonClass } from "@/components/ui/button";
import { FilterChip, Segmented } from "@/components/ui/controls";
import { DemoBadge } from "@/components/ui/demo-badge";
import { EASE_OUT } from "@/components/ui/motion";

type Sort = "newest" | "oldest" | "longest";
type View = "grid" | "list";

export type LibraryData = {
  recordings: Recording[];
  games: Game[];
  sessions: Session[];
  moments: Record<string, Moment[]>;
};

export function LibraryBrowser({ data }: { data: LibraryData }) {
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [gameIds, setGameIds] = useState<string[]>([]);
  const [month, setMonth] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [view, setView] = useState<View>("grid");
  const [openId, setOpenId] = useState<string | null>(null);

  const gameById = useMemo(() => new Map(data.games.map((g) => [g.id, g])), [data.games]);
  const sessionById = useMemo(() => new Map(data.sessions.map((s) => [s.id, s])), [data.sessions]);
  const months = useMemo(
    () => [...new Set(data.recordings.map((r) => formatMonth(r.recordedAt)))],
    [data.recordings],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.recordings.filter((r) => {
      if (gameIds.length && !gameIds.includes(r.gameId)) return false;
      if (month !== "all" && formatMonth(r.recordedAt) !== month) return false;
      if (!q) return true;
      const haystack = [
        r.title,
        r.ownerLabel,
        gameById.get(r.gameId)?.name,
        r.sessionId ? sessionById.get(r.sessionId)?.title : "",
        formatDate(r.recordedAt),
        ...(data.moments[r.id] ?? []).map((m) => m.title),
      ]
        .join(" ")
        .toLowerCase();
      return q.split(/\s+/).every((term) => haystack.includes(term));
    });
    return list.sort((a, b) =>
      sort === "newest" ? b.recordedAt - a.recordedAt : sort === "oldest" ? a.recordedAt - b.recordedAt : b.durationMs - a.durationMs,
    );
  }, [data, query, gameIds, month, sort, gameById, sessionById]);

  const open = openId ? data.recordings.find((r) => r.id === openId) : undefined;
  const hasFilters = query || gameIds.length || month !== "all";

  return (
    <>
      {/* Toolbar */}
      <div className="sticky top-0 z-20 -mx-4 mb-8 border-b border-line bg-bg/80 px-4 py-4 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <label className="flex h-11 min-w-0 items-center gap-3 lg:flex-1 rounded-xl border border-line bg-surface-2 px-3.5 transition-colors focus-within:border-accent/50">
            <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
            <span className="sr-only">Filter recordings</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, game, player, session…"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear filter" className="text-ink-faint hover:text-ink">
                <X className="size-4" aria-hidden />
              </button>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative">
              <span className="sr-only">Month</span>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-11 appearance-none rounded-xl border border-line bg-surface-2 pl-3.5 pr-9 text-[13px] text-ink outline-none transition-colors hover:border-line-strong focus-visible:border-accent/50"
              >
                <option value="all">All dates</option>
                {months.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-faint">▼</span>
            </label>
            <label className="relative">
              <span className="sr-only">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="h-11 appearance-none rounded-xl border border-line bg-surface-2 pl-3.5 pr-9 text-[13px] text-ink outline-none transition-colors hover:border-line-strong focus-visible:border-accent/50"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="longest">Longest first</option>
              </select>
              <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-faint">▼</span>
            </label>
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: <><LayoutGrid className="size-4" aria-hidden /><span className="sr-only">Grid</span></>, title: "Grid view" },
                { value: "list", label: <><List className="size-4" aria-hidden /><span className="sr-only">List</span></>, title: "List view" },
              ]}
            />
          </div>
        </div>
        <div className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by game">
          {data.games.map((g) => (
            <FilterChip
              key={g.id}
              pressed={gameIds.includes(g.id)}
              onPressedChange={(on) => setGameIds((ids) => (on ? [...ids, g.id] : ids.filter((id) => id !== g.id)))}
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: `hsl(${g.art.hue} 80% 60%)` }} />
              {g.name}
            </FilterChip>
          ))}
        </div>
      </div>

      <p className="mb-5 text-[13px] text-ink-faint" aria-live="polite">
        {plural(filtered.length, "recording")}
        {hasFilters ? " match" : ""} · {duration(filtered.reduce((s, r) => s + r.durationMs, 0))} of gameplay
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong px-6 py-20 text-center">
          <SearchX className="mx-auto size-8 text-ink-faint" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 text-[17px] font-medium text-ink">Nothing matches these filters</p>
          <p className="mt-1 text-[14px] text-ink-muted">Try a different game or date, or clear the search.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setGameIds([]);
              setMonth("all");
            }}
            className={buttonClass("secondary", "md", "mt-6")}
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <LayoutGroup>
          <motion.ul
            layout={!reduce}
            className={cn(view === "grid" ? "grid gap-x-5 gap-y-9 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col divide-y divide-line border-y border-line")}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {filtered.map((r) => {
                const game = gameById.get(r.gameId);
                const session = r.sessionId ? sessionById.get(r.sessionId) : undefined;
                const momentCount = data.moments[r.id]?.length ?? 0;
                return (
                  <motion.li
                    key={r.id}
                    layout={!reduce}
                    initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
                    transition={{ duration: 0.3, ease: EASE_OUT }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(r.id)}
                      aria-haspopup="dialog"
                      className={cn(
                        "group w-full rounded-2xl text-left outline-offset-4",
                        view === "list" && "flex items-center gap-4 py-3 sm:gap-6",
                      )}
                    >
                      <div
                        className={cn(
                          "relative shrink-0 overflow-hidden ring-1 ring-line transition-shadow group-hover:ring-line-strong",
                          view === "grid" ? "aspect-video rounded-2xl" : "aspect-video w-32 rounded-xl sm:w-44",
                        )}
                      >
                        <div className="absolute inset-0 transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-[1.05]">
                          <SceneArt art={r.art} />
                        </div>
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white/90 backdrop-blur">
                          {timecode(r.durationMs)}
                        </span>
                        {view === "grid" && momentCount > 0 && (
                          <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white/85 backdrop-blur">
                            {plural(momentCount, "moment")}
                          </span>
                        )}
                      </div>
                      <div className={cn("min-w-0", view === "grid" ? "mt-3 px-0.5" : "flex-1")}>
                        <p className="truncate text-[15px] font-medium text-ink transition-colors group-hover:text-white">{r.title}</p>
                        <p className="mt-0.5 truncate text-[13px] text-ink-faint">
                          {game?.name} · {formatDate(r.recordedAt)} · {r.ownerLabel === "You" ? "Your POV" : `${r.ownerLabel}'s POV`}
                        </p>
                        {view === "list" && session && (
                          <p className="mt-1 hidden truncate text-[13px] text-ink-muted sm:block">Session: {session.title}</p>
                        )}
                      </div>
                      {view === "list" && (
                        <span className="hidden shrink-0 text-right text-[13px] tabular-nums text-ink-faint md:block">
                          {fileSize(r.sizeBytes)}
                          <br />
                          {plural(momentCount, "moment")}
                        </span>
                      )}
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        </LayoutGroup>
      )}

      <RecordingSheet
        recording={open}
        game={open ? gameById.get(open.gameId) : undefined}
        session={open?.sessionId ? sessionById.get(open.sessionId) : undefined}
        moments={open ? (data.moments[open.id] ?? []) : []}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function RecordingSheet({
  recording,
  game,
  session,
  moments,
  onClose,
}: {
  recording: Recording | undefined;
  game: Game | undefined;
  session: Session | undefined;
  moments: Moment[];
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const [seek, setSeek] = useState<SeekRequest | undefined>();

  return (
    <Dialog.Root open={!!recording} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {recording && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col overflow-y-auto border-l border-line-strong bg-surface shadow-2xl"
                initial={reduce ? { opacity: 0 } : { x: "100%" }}
                animate={reduce ? { opacity: 1 } : { x: 0 }}
                exit={reduce ? { opacity: 0 } : { x: "100%" }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
              >
                <div className="flex items-center justify-between gap-4 px-5 pt-5 sm:px-7">
                  <DemoBadge />
                  <Dialog.Close className="grid size-10 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink" aria-label="Close details">
                    <X className="size-5" aria-hidden />
                  </Dialog.Close>
                </div>
                <div className="px-5 pb-10 pt-4 sm:px-7">
                  <RecordingPlayer key={recording.id} recording={recording} moments={moments} seek={seek} />
                  <p className="mt-6 text-[12px] font-medium uppercase tracking-[0.18em] text-accent-ink">{game?.name}</p>
                  <Dialog.Title className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink">
                    {recording.title}
                  </Dialog.Title>
                  <p className="mt-2 text-[14px] text-ink-muted">
                    {formatLongDate(recording.recordedAt)} at {formatTime(recording.recordedAt)} UTC
                  </p>

                  <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-[13px] sm:grid-cols-3">
                    {[
                      ["Duration", duration(recording.durationMs)],
                      ["Perspective", recording.ownerLabel],
                      ["Resolution", `${recording.width}×${recording.height} · ${recording.fps} fps`],
                      ["Format", recording.container],
                      ["Size", fileSize(recording.sizeBytes)],
                      ["Moments", String(moments.length)],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-surface-2 px-4 py-3">
                        <dt className="text-ink-faint">{k}</dt>
                        <dd className="mt-0.5 font-medium text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  {moments.length > 0 && (
                    <>
                      <h3 className="mb-3 mt-8 text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">Moments</h3>
                      <ul className="flex flex-col gap-1">
                        {moments.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => setSeek({ ms: m.startMs, nonce: Date.now(), play: true })}
                              className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface-3"
                            >
                              <span className="w-12 shrink-0 font-mono text-[12px] tabular-nums text-ink-faint">{timecode(m.startMs)}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-medium text-ink">{m.title}</span>
                                <KindTag kind={m.kind} className="mt-0.5" />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {session && (
                    <Link
                      href={`/sessions/${session.id}`}
                      transitionTypes={["nav-forward"]}
                      className={buttonClass("secondary", "md", "mt-8 w-full justify-between")}
                    >
                      <span className="truncate">Part of “{session.title}”</span>
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
