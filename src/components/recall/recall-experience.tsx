"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  AudioWaveform,
  Eye,
  MessageSquareQuote,
  Search,
  SearchX,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { EvidenceKind, SearchResult } from "@/lib/memory/contracts";
import { getMemoryRepository, SUGGESTED_QUERIES } from "@/lib/memory/repository";
import { formatDate, plural, timecode } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RecordingPlayer } from "@/components/media/demo-player";
import { SceneArt } from "@/components/media/scene-art";
import { KindTag } from "@/components/memory/kind";
import { FilterChip } from "@/components/ui/controls";
import { DemoBadge, Notice } from "@/components/ui/demo-badge";
import { EASE_OUT } from "@/components/ui/motion";
import { Highlight } from "./highlight";

const repo = getMemoryRepository();

const EVIDENCE_META: Record<EvidenceKind, { label: string; icon: LucideIcon }> = {
  speech: { label: "Voice chat", icon: MessageSquareQuote },
  visual: { label: "On screen", icon: Eye },
  audio: { label: "Audio peak", icon: AudioWaveform },
  title: { label: "Moment", icon: Tag },
};

const FILTERABLE: EvidenceKind[] = ["speech", "visual", "audio"];

export function RecallExperience() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const reduce = useReducedMotion();

  const [draft, setDraft] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  const [gameIds, setGameIds] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<EvidenceKind[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the input in sync when the URL query changes (e.g. from ⌘K).
  if (q !== lastQ) {
    setLastQ(q);
    setDraft(q);
    setSelectedId(null);
  }

  const response = useMemo(
    () => (q.trim() ? repo.search(q, { gameIds, evidence }) : null),
    [q, gameIds, evidence],
  );
  const results = response?.results ?? [];
  const selected = results.find((r) => r.moment.id === selectedId) ?? results[0] ?? null;

  function submit(next: string) {
    const trimmed = next.trim();
    router.replace(trimmed ? `${pathname}?q=${encodeURIComponent(trimmed)}` : pathname, { scroll: false });
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = results.findIndex((r) => r.moment.id === selected?.moment.id);
    const next = results[Math.max(0, Math.min(results.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    setSelectedId(next.moment.id);
    listRef.current?.querySelector<HTMLElement>(`[data-id="${next.moment.id}"]`)?.focus();
  }

  return (
    <div>
      {/* Search bar */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(draft);
        }}
        className="relative"
      >
        <div className="flex items-center gap-3 rounded-2xl border border-line-strong bg-surface-2 py-2 pl-5 pr-2 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.9)] transition-colors focus-within:border-accent/50">
          <Search className="size-5 shrink-0 text-accent-ink" strokeWidth={1.75} aria-hidden />
          <label htmlFor="recall-q" className="sr-only">Search your memories</label>
          <input
            id="recall-q"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Describe a moment — “when everyone was laughing”"
            autoComplete="off"
            autoFocus={!q}
            className="h-12 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-faint"
          />
          {draft && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                submit("");
              }}
              aria-label="Clear search"
              className="grid size-9 place-items-center rounded-lg text-ink-faint hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
          <button type="submit" className="h-11 shrink-0 rounded-xl bg-accent px-5 text-[14px] font-medium text-white transition-colors hover:bg-accent-strong">
            Search
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-ink-faint">
        <DemoBadge />
        <span>Keyword matching over demo fixtures — semantic search over your own recordings comes later.</span>
      </div>

      {!q.trim() ? (
        <Suggestions onPick={(s) => submit(s)} />
      ) : (
        <>
          {/* Filters */}
          <div className="mt-8 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
            {repo.games().map((g) => (
              <FilterChip
                key={g.id}
                pressed={gameIds.includes(g.id)}
                onPressedChange={(on) => setGameIds((ids) => (on ? [...ids, g.id] : ids.filter((x) => x !== g.id)))}
              >
                {g.name}
              </FilterChip>
            ))}
            <span aria-hidden className="mx-1 hidden h-5 w-px bg-line-strong sm:block" />
            {FILTERABLE.map((k) => {
              const Icon = EVIDENCE_META[k].icon;
              return (
                <FilterChip
                  key={k}
                  pressed={evidence.includes(k)}
                  onPressedChange={(on) => setEvidence((ks) => (on ? [...ks, k] : ks.filter((x) => x !== k)))}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {EVIDENCE_META[k].label}
                </FilterChip>
              );
            })}
          </div>

          <p className="mt-6 text-[13px] text-ink-faint" aria-live="polite">
            {results.length ? `${plural(results.length, "moment")} for “${q}”` : `No moments for “${q}”`}
          </p>

          {results.length === 0 ? (
            <NoResults hasFilters={gameIds.length + evidence.length > 0} onClearFilters={() => { setGameIds([]); setEvidence([]); }} onPick={submit} />
          ) : (
            <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <ol
                ref={listRef}
                onKeyDown={onListKeyDown}
                aria-label="Search results"
                className="order-2 flex flex-col gap-2 lg:order-1"
              >
                <AnimatePresence initial={false}>
                  {results.map((r, i) => (
                    <motion.li
                      key={r.moment.id}
                      layout={!reduce}
                      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(i, 8) * 0.03, ease: EASE_OUT }}
                    >
                      <ResultCard
                        result={r}
                        selected={r.moment.id === selected?.moment.id}
                        onSelect={() => setSelectedId(r.moment.id)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
              {selected && (
                <div className="order-1 lg:order-2">
                  <div className="lg:sticky lg:top-6">
                    <ResultDetail result={selected} />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Suggestions({ onPick }: { onPick: (q: string) => void }) {
  return (
    <section aria-labelledby="suggest-heading" className="mt-14">
      <h2 id="suggest-heading" className="text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">
        Try asking
      </h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUGGESTED_QUERIES.map((s, i) => (
          <motion.li
            key={s}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.05, ease: EASE_OUT }}
          >
            <button
              type="button"
              onClick={() => onPick(s)}
              className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2/70 px-5 py-4 text-left text-[15px] text-ink-muted transition-all hover:border-line-strong hover:bg-surface-3 hover:text-ink"
            >
              <span>“{s}”</span>
              <ArrowRight className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent-ink" aria-hidden />
            </button>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

function NoResults({
  hasFilters,
  onClearFilters,
  onPick,
}: {
  hasFilters: boolean;
  onClearFilters: () => void;
  onPick: (q: string) => void;
}) {
  return (
    <div className="mt-6 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
      <SearchX className="mx-auto size-8 text-ink-faint" strokeWidth={1.5} aria-hidden />
      <p className="mt-4 text-[17px] font-medium text-ink">No moments match that yet</p>
      <p className="mx-auto mt-1 max-w-md text-[14px] text-ink-muted">
        Demo search matches words in moment titles, voice chat, and on-screen descriptions.
        {hasFilters ? " Your filters may be hiding results." : " Try different words, or one of these:"}
      </p>
      {hasFilters ? (
        <button type="button" onClick={onClearFilters} className="mt-6 h-10 rounded-xl border border-line-strong bg-surface-3 px-4 text-[14px] font-medium text-ink hover:bg-surface-4">
          Clear filters
        </button>
      ) : (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {SUGGESTED_QUERIES.slice(0, 4).map((s) => (
            <button key={s} type="button" onClick={() => onPick(s)} className="h-9 rounded-full border border-line bg-surface-2 px-3.5 text-[13px] text-ink-muted hover:border-line-strong hover:text-ink">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({
  result,
  selected,
  onSelect,
}: {
  result: SearchResult;
  selected: boolean;
  onSelect: () => void;
}) {
  const top = result.evidence.find((e) => e.kind !== "title") ?? result.evidence[0];
  const Icon = EVIDENCE_META[top.kind].icon;
  const game = repo.game(result.recording.gameId);
  return (
    <button
      type="button"
      data-id={result.moment.id}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative flex w-full gap-4 rounded-2xl border p-3 text-left transition-all duration-200",
        selected
          ? "border-accent/40 bg-surface-3 shadow-[0_0_0_1px_rgb(139_92_255/0.15)]"
          : "border-transparent hover:border-line hover:bg-surface-2",
      )}
    >
      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl ring-1 ring-line sm:w-40">
        <SceneArt art={{ ...result.recording.art, seed: result.recording.art.seed + result.moment.startMs / 1000 }} />
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white">
          {timecode(result.seekMs)}
        </span>
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <KindTag kind={result.moment.kind} />
        <p className="mt-0.5 truncate text-[15px] font-medium text-ink">{result.moment.title}</p>
        <p className="truncate text-[12.5px] text-ink-faint">
          {game?.name} · {formatDate(result.recording.recordedAt)}
        </p>
        <p className="mt-2 line-clamp-2 flex gap-1.5 text-[13px] leading-snug text-ink-muted">
          <Icon className="mt-0.5 size-3.5 shrink-0 text-ink-faint" aria-label={EVIDENCE_META[top.kind].label} />
          <span>
            {top.speaker && <span className="text-ink-faint">{top.speaker}: </span>}
            <Highlight text={top.text} terms={top.matched} />
          </span>
        </p>
      </div>
    </button>
  );
}

function ResultDetail({ result }: { result: SearchResult }) {
  const { moment, recording, session } = result;
  const moments = repo.momentsForRecording(recording.id);
  const matchedLines = new Set(result.evidence.filter((e) => e.kind === "speech").map((e) => e.tMs));
  const matchedTerms = result.evidence.flatMap((e) => e.matched);

  return (
    <article aria-label={`Selected: ${moment.title}`} className="rounded-3xl border border-line bg-surface-2/60 p-3 sm:p-4">
      <RecordingPlayer
        key={recording.id}
        recording={recording}
        moments={moments}
        seek={{ ms: result.seekMs, nonce: result.seekMs + moment.startMs }}
        title={moment.title}
      />
      <div className="px-1 pb-1 pt-5 sm:px-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <KindTag kind={moment.kind} />
            <h2 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">{moment.title}</h2>
            <p className="mt-1 text-[13px] text-ink-faint">
              {recording.title} · starts at {timecode(moment.startMs)}
            </p>
          </div>
          {session && (
            <Link
              href={`/sessions/${session.id}?moment=${moment.id}`}
              transitionTypes={["nav-forward"]}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong bg-surface-3 px-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-4"
            >
              Open in Time Machine <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>

        <h3 className="mb-2 mt-6 text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Why this matched</h3>
        <ul className="flex flex-col gap-2">
          {result.evidence.map((e, i) => {
            const meta = EVIDENCE_META[e.kind];
            const Icon = meta.icon;
            return (
              <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface/60 px-3.5 py-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-accent-ink" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 text-[13.5px] leading-relaxed">
                  <p className="text-[11.5px] font-medium uppercase tracking-wider text-ink-faint">
                    {meta.label} · {timecode(e.tMs)}
                  </p>
                  <p className="mt-0.5 text-ink-muted">
                    {e.speaker && <span className="text-ink">{e.speaker}: </span>}
                    <Highlight text={e.text} terms={e.matched} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        {moment.transcript.length > 0 && (
          <>
            <h3 className="mb-2 mt-6 text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Transcript</h3>
            <ol className="flex flex-col gap-1.5 text-[13.5px]">
              {moment.transcript.map((line) => (
                <li
                  key={line.tMs}
                  className={cn(
                    "grid grid-cols-[3.25rem_1fr] gap-2 rounded-lg px-2 py-1",
                    matchedLines.has(line.tMs) && "bg-accent/10",
                  )}
                >
                  <span className="font-mono text-[12px] tabular-nums text-ink-faint">{timecode(line.tMs)}</span>
                  <span className="text-ink-muted">
                    <span className="text-ink">{line.speaker}: </span>
                    <Highlight text={line.text} terms={matchedTerms} />
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
        <Notice className="mt-6">
          Transcript and on-screen descriptions here are written fixtures. Real ones will come from your recordings’ audio and frames.
        </Notice>
      </div>
    </article>
  );
}
