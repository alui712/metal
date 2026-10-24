"use client";

import { CircleAlert, Clapperboard, ExternalLink, LoaderCircle, Mic, Play, Search, Sparkles, Type, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate, timecode } from "@/lib/format";
import { Highlight } from "./highlight";

// Client types mirror src/server/search/recall.ts + /api/recall (no paths).
type Line = { segmentId: string; startMs: number; endMs: number; text: string; matched: string[] };
type Hit = {
  recordingId: string;
  startMs: number;
  endMs: number;
  seekMs: number;
  lines: Line[];
  sources: Array<"phrase" | "keyword" | "semantic" | "title">;
  reasons: string[];
  score: number;
  strength: "strong" | "good" | "weak";
  recording: { id: string; title: string; game: string | null; recordedAt: number; durationMs: number | null; posterUrl: string | null; videoUrl: string | null };
};
type Response = {
  query: string;
  results: Hit[];
  ambiguous: boolean;
  semantic: { available: boolean; reason: string | null };
  index: { segments: number; recordings: number; embedded: number; flagged: number };
  facets: { games: string[]; recordings: Array<{ id: string; title: string }> };
};

const FILTERS = ["recording", "game", "from", "to"] as const;
const STRENGTH = {
  strong: { label: "Strong match", cls: "border-ok/30 bg-ok/10 text-ok" },
  good: { label: "Good match", cls: "border-accent/40 bg-accent/10 text-accent-ink" },
  weak: { label: "Loosely related", cls: "border-line-strong text-ink-muted" },
};
const SOURCE = { phrase: { label: "Exact phrase", icon: Type }, keyword: { label: "Words", icon: Search }, semantic: { label: "Meaning", icon: Sparkles }, title: { label: "Recording name", icon: Type } };
const keyOf = (h: Hit) => `${h.recordingId}:${h.startMs}:${h.sources.join()}`;

/** Recall over the real library: transcripts (keywords + local semantic search) and recording names. */
export function LibraryRecall() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const filterKey = FILTERS.map((f) => params.get(f) ?? "").join("|");
  const [draft, setDraft] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  const key = `${q}|${filterKey}`;
  const [fetched, setFetched] = useState<{ key: string; data: Response | null; error: boolean } | null>(null);
  const data = fetched?.data ?? null;
  const error = fetched?.key === key && fetched.error;
  const loading = fetched?.key !== key;
  const [selected, setSelected] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  if (q !== lastQ) {
    setLastQ(q);
    setDraft(q);
    setSelected(null);
  }

  useEffect(() => {
    let alive = true;
    const sp = new URLSearchParams({ q });
    for (const f of FILTERS) if (params.get(f)) sp.set(f, params.get(f)!);
    fetch(`/api/recall?${sp}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Response) => alive && setFetched({ key, data: d, error: false }))
      .catch(() => alive && setFetched((f) => ({ key, data: f?.data ?? null, error: true })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on query/filter change only
  }, [key]);

  const nav = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const s = sp.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const results = q.trim() ? (data?.results ?? []) : [];
  const current = results.find((h) => keyOf(h) === selected) ?? results[0] ?? null;
  const hasFilters = FILTERS.some((f) => params.get(f));

  /** Loads a hit into the player at its exact second; plays it when asked. */
  const cue = useCallback((h: Hit, autoplay: boolean) => {
    const v = video.current;
    if (!v || !h.recording.videoUrl) return;
    const go = () => {
      v.currentTime = h.seekMs / 1000;
      if (autoplay) void v.play().catch(() => {});
    };
    if (v.getAttribute("src") !== h.recording.videoUrl) {
      v.src = h.recording.videoUrl;
      v.addEventListener("loadedmetadata", go, { once: true });
    } else go();
  }, []);

  function play(h: Hit) {
    setSelected(keyOf(h));
    cue(h, true);
    if (window.innerWidth < 1024) video.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // The top result is ready to play the moment results arrive (cued at its second, not autoplayed).
  const currentKey = current ? keyOf(current) : null;
  useEffect(() => {
    if (current && video.current?.paused) cue(current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-cue only when the shown hit changes
  }, [currentKey]);

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          nav({ q: draft.trim() || null });
        }}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-line-strong bg-surface-2 py-2 pl-5 pr-2 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.9)] transition-colors focus-within:border-accent/50">
          <Search className="size-5 shrink-0 text-accent-ink" strokeWidth={1.75} aria-hidden />
          <label htmlFor="recall-q" className="sr-only">Search your recordings</label>
          <input
            id="recall-q"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What was said? — “enemies on the stairs”"
            autoComplete="off"
            autoFocus={!q}
            className="h-12 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-faint"
          />
          {draft && (
            <button type="button" onClick={() => (setDraft(""), nav({ q: null }))} aria-label="Clear search" className="grid size-9 place-items-center rounded-lg text-ink-faint hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          )}
          <button type="submit" className="h-11 shrink-0 rounded-xl bg-accent px-5 text-[14px] font-medium text-white transition-colors hover:bg-accent-strong">
            Search
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-end gap-3 text-[12.5px]" aria-label="Filters">
        <label className="flex min-w-0 flex-col gap-1 text-ink-faint">
          Recording
          <select value={params.get("recording") ?? ""} onChange={(e) => nav({ recording: e.target.value || null })} className="h-9 max-w-[16rem] rounded-lg border border-line bg-surface-2 px-2 text-ink">
            <option value="">All transcribed</option>
            {data?.facets.recordings.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </label>
        {(data?.facets.games.length ?? 0) > 0 && (
          <label className="flex flex-col gap-1 text-ink-faint">
            Game
            <select value={params.get("game") ?? ""} onChange={(e) => nav({ game: e.target.value || null })} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-ink">
              <option value="">Any game</option>
              {data!.facets.games.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-ink-faint">
          From
          <input type="date" value={params.get("from") ?? ""} onChange={(e) => nav({ from: e.target.value || null })} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-ink [color-scheme:dark]" />
        </label>
        <label className="flex flex-col gap-1 text-ink-faint">
          To
          <input type="date" value={params.get("to") ?? ""} onChange={(e) => nav({ to: e.target.value || null })} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-ink [color-scheme:dark]" />
        </label>
        {hasFilters && (
          <button type="button" onClick={() => nav({ recording: null, game: null, from: null, to: null })} className="h-9 rounded-lg px-2 font-medium text-accent-ink hover:text-white">
            Clear filters
          </button>
        )}
      </div>

      {data && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-faint">
          <Mic className="size-3.5" aria-hidden />
          Searching {data.index.segments} machine-transcribed line{data.index.segments === 1 ? "" : "s"} from {data.index.recordings} recording{data.index.recordings === 1 ? "" : "s"}, on this computer.
          {data.semantic.available ? " Matches by words and by meaning." : ` Keyword matching only — ${data.semantic.reason}`}
          {data.index.flagged > 0 && ` ${data.index.flagged} line${data.index.flagged === 1 ? "" : "s"} you marked wrong ${data.index.flagged === 1 ? "is" : "are"} excluded.`}
        </p>
      )}
      {error && <p role="alert" className="mt-6 text-[13px] text-danger">Couldn’t search. Is the METAL server running?</p>}

      {!q.trim() && data && data.index.segments === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-ink">Nothing to search yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-ink-muted">
            Recall searches what was said in your recordings. Open a recording and choose <span className="text-ink">Transcribe speech</span> first.
          </p>
          <Link href="/library" className="mt-4 inline-block text-[13px] font-medium text-accent-ink hover:text-white">Go to Library →</Link>
        </div>
      )}

      {q.trim() && data && !loading && results.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center" role="status">
          <p className="text-[15px] font-medium text-ink">No moments match “{data.query}”</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-ink-muted">
            Recall only finds things that were said (and recording names) — it can’t see what happened on screen.
            {hasFilters ? " Your filters may be hiding results." : " Try other words, or describe what someone said."}
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="min-w-0">
            <p className="mb-3 text-[13px] text-ink-muted" aria-live="polite">
              {loading && <LoaderCircle className="mr-1.5 inline size-3.5 animate-spin" aria-hidden />}
              {results.length} moment{results.length === 1 ? "" : "s"} for “{data!.query}”
            </p>
            {data!.ambiguous && (
              <p className="mb-3 flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> No close matches. These are only loosely related — check before relying on them.
              </p>
            )}
            <ol aria-label="Results" className="space-y-2">
              {results.map((h) => {
                const active = current && keyOf(current) === keyOf(h);
                return (
                  <li key={keyOf(h)}>
                    <button
                      type="button"
                      onClick={() => play(h)}
                      aria-current={active ? "true" : undefined}
                      className={cn("w-full rounded-2xl border p-4 text-left transition-colors", active ? "border-accent/50 bg-accent/[0.07]" : "border-line bg-surface-2/60 hover:border-line-strong")}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 truncate text-[14px] font-medium text-ink">{h.recording.title}</span>
                        <span className="font-mono text-[12px] tabular-nums text-accent-ink">{h.lines.length ? timecode(h.seekMs) : "whole recording"}</span>
                        <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[11px] font-medium", STRENGTH[h.strength].cls)}>{STRENGTH[h.strength].label}</span>
                      </div>
                      {h.lines.map((l) => (
                        <p key={l.segmentId} className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
                          <span className="mr-2 font-mono text-[11.5px] text-ink-faint">{timecode(l.startMs)}</span>“<Highlight text={l.text} terms={l.matched} />”
                        </p>
                      ))}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-faint">
                        {h.sources.map((s) => {
                          const Icon = SOURCE[s].icon;
                          return (
                            <span key={s} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5">
                              <Icon className="size-3" aria-hidden /> {SOURCE[s].label}
                            </span>
                          );
                        })}
                        <span>{h.reasons.join(" · ")}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <video ref={video} controls playsInline poster={current?.recording.posterUrl ?? undefined} aria-label={current ? `${current.recording.title} at ${timecode(current.seekMs)}` : "Player"} className="aspect-video w-full scroll-mt-6 rounded-2xl bg-black object-contain" />
            {current && (
              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-[14px] font-medium text-ink">
                    {current.recording.title}
                    <span className="ml-2 text-[12.5px] font-normal text-ink-faint">
                      {formatDate(current.recording.recordedAt)}
                      {current.recording.game ? ` · ${current.recording.game}` : ""}
                    </span>
                  </p>
                  <div className="flex items-center gap-3 text-[12.5px]">
                    <button type="button" onClick={() => play(current)} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:text-white">
                      <Play className="size-3.5" aria-hidden /> Play from {timecode(current.seekMs)}
                    </button>
                    <Link href={`/recordings/${current.recordingId}?t=${current.seekMs}`} className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink">
                      Open recording <ExternalLink className="size-3.5" aria-hidden />
                    </Link>
                    <StartStory hit={current} />
                  </div>
                </div>
                {current.lines.length > 0 && (
                  <blockquote className="mt-3 border-l-2 border-accent/60 pl-3.5">
                    {current.lines.map((l) => (
                      <p key={l.segmentId} className="text-[16px] leading-snug text-ink">
                        <span className="mr-2 font-mono text-[12px] tabular-nums text-accent-ink">{timecode(l.startMs)}</span>
                        <Highlight text={l.text} terms={l.matched} />
                      </p>
                    ))}
                  </blockquote>
                )}
                <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
                  Machine transcription (whisper.cpp) — words may be wrong. A match shows what was said, not what happened on screen.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Recall → Story Studio: a clip around the matched lines (±3 s), captioned with what was actually said. */
function StartStory({ hit }: { hit: Hit }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    setError(null);
    const caption = hit.lines.map((l) => l.text).join(" ").slice(0, 200) || null;
    const res = await fetch("/api/stories", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-metal-action": "1" },
      body: JSON.stringify({
        sessionId: null,
        title: `${hit.recording.title} · ${timecode(hit.startMs)}`,
        ranges: [{ recordingId: hit.recordingId, inMs: Math.max(0, hit.startMs - 3000), outMs: Math.min(hit.recording.durationMs ?? hit.endMs + 3000, hit.endMs + 3000), caption }],
      }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { id?: string; error?: string }) : {};
    if (res?.ok && json.id) router.push(`/studio?story=${json.id}`);
    else {
      setError(json.error ?? "Couldn’t start a story.");
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" onClick={start} disabled={busy} className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink disabled:opacity-50">
        <Clapperboard className="size-3.5" aria-hidden /> {busy ? "Starting…" : "Start a story"}
      </button>
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </>
  );
}
