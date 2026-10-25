"use client";

import { CircleAlert, Clapperboard, ExternalLink, Eye, Gamepad2, LoaderCircle, Mic, Play, Search, Sparkles, Type, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDate, timecode } from "@/lib/format";
import { recallFetch } from "@/lib/recall/fetch";
import { Highlight } from "./highlight";

// Client types mirror src/server/search/{recall,games}.ts, src/server/visual/search.ts + /api/recall (no paths).
type Visual = { confidence: "likely" | "low"; similarity: number; frames: Array<{ frameId: string; tMs: number; similarity: number }>; model: string; intervalMs: number };
type Line = { segmentId: string; startMs: number; endMs: number; text: string; matched: string[] };
type Hit = {
  recordingId: string;
  startMs: number;
  endMs: number;
  seekMs: number;
  lines: Line[];
  sources: Array<"phrase" | "keyword" | "semantic" | "title" | "visual" | "game">;
  reasons: string[];
  score: number;
  strength: "strong" | "good" | "weak";
  visual?: Visual;
  recording: { id: string; title: string; game: string | null; recordedAt: number; durationMs: number | null; posterUrl: string | null; videoUrl: string | null };
};
type Response = {
  query: string;
  results: Hit[];
  ambiguous: boolean;
  semantic: { available: boolean; reason: string | null };
  index: { segments: number; recordings: number; embedded: number; flagged: number };
  visual: { available: boolean; reason: string | null; frames: number; recordings: number; eventQuery: boolean };
  games: { genres: string[]; games: string[]; rest: string; tagged: number };
  facets: { games: string[]; recordings: Array<{ id: string; title: string }> };
  scope: { kind: "library" } | { kind: "demo"; recording: { id: string; title: string }; lines: number; frames: number };
};

const FILTERS = ["recording", "game", "from", "to"] as const;
const STRENGTH = {
  strong: { label: "Strong match", cls: "border-ok/30 bg-ok/10 text-ok" },
  good: { label: "Good match", cls: "border-accent/40 bg-accent/10 text-accent-ink" },
  weak: { label: "Loosely related", cls: "border-line-strong text-ink-muted" },
};
// Visual-only moments are approximate by nature, so they get their own wording.
const VISUAL_STRENGTH = {
  likely: { label: "Looks similar · approximate", cls: "border-accent/40 bg-accent/10 text-accent-ink" },
  low: { label: "Low confidence · approximate", cls: "border-warn/30 bg-warn/10 text-warn" },
};
// Game-only results come from the game set on the recording: whole-recording, never a moment on screen.
const GAME_BADGE = { label: "Game match · set by you", cls: "border-line-strong bg-surface-3 text-ink" };
const badge = (h: Hit) =>
  h.visual && !h.lines.length ? VISUAL_STRENGTH[h.visual.confidence] : h.sources.length === 1 && h.sources[0] === "game" && h.strength !== "weak" ? GAME_BADGE : STRENGTH[h.strength];
const SOURCE = { phrase: { label: "Exact phrase", icon: Type }, keyword: { label: "Words", icon: Search }, semantic: { label: "Meaning", icon: Sparkles }, title: { label: "Recording name", icon: Type }, visual: { label: "Looks like", icon: Eye }, game: { label: "Game", icon: Gamepad2 } };
const frameUrl = (id: string) => `/api/visual-frames/${id}`;
const keyOf = (h: Hit) => `${h.recordingId}:${h.startMs}:${h.sources.join()}`;

/** Recall over the real library: transcripts (keywords + local semantic search) and recording names. */
export function LibraryRecall() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  const filterKey = FILTERS.map((f) => params.get(f) ?? "").join("|");
  // Guided demo (?judge=1): the server limits the search to the prepared recording.
  const judge = params.get("judge") === "1";
  // Experimental scene search is opt-in per search (?visual=1); off, Recall searches speech and names only.
  const visual = params.get("visual") === "1";
  const [draft, setDraft] = useState(q);
  const [lastQ, setLastQ] = useState(q);
  const [attempt, setAttempt] = useState(0);
  const key = `${q}|${filterKey}|${judge}|${visual}|${attempt}`;
  // Only the response for the current query (and retry) is ever shown; `last`
  // keeps the index stats and filter options steady while a new search loads.
  const [fetched, setFetched] = useState<{ key: string; data: Response | null; error: string | null; last: Response | null } | null>(null);
  const settled = fetched?.key === key;
  const loading = !settled;
  const data = settled ? fetched.data : null;
  const error = settled ? fetched.error : null;
  const known = data ?? fetched?.last ?? null;
  const [selected, setSelected] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  if (q !== lastQ) {
    setLastQ(q);
    setDraft(q);
    setSelected(null);
  }

  useEffect(() => {
    const ctrl = new AbortController();
    const sp = new URLSearchParams({ q });
    for (const f of FILTERS) if (params.get(f)) sp.set(f, params.get(f)!);
    if (judge) sp.set("judge", "1");
    if (visual) sp.set("visual", "1");
    recallFetch<Response>(`/api/recall?${sp}`, ctrl.signal).then(
      (d) => setFetched((f) => ({ key, data: d, error: null, last: d ?? f?.last ?? null })),
      (e: unknown) => !ctrl.signal.aborted && setFetched((f) => ({ key, data: null, error: e instanceof Error ? e.message : String(e), last: f?.last ?? null })),
    );
    // A newer search (or leaving the page) cancels this one, so late answers never land.
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on query/filter/retry change only
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

  const results = q.trim() && data ? data.results : [];
  const current = results.find((h) => keyOf(h) === selected) ?? results[0] ?? null;
  const hasFilters = FILTERS.some((f) => params.get(f));
  // Nothing transcribed or visually indexed yet: filters have nothing to narrow, and "try other words" would mislead.
  const emptyIndex = known !== null && known.index.segments === 0 && known.visual.frames === 0;
  // Guided demo: what the server actually searched (one approved recording), with that recording's own counts.
  const demo = known?.scope?.kind === "demo" ? known.scope : null;
  const libraryHref = `/recall${q || visual ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(visual ? { visual: "1" } : {}) })}` : ""}`;

  /** Loads a hit into the player at its exact second; plays it when asked. */
  const cue = useCallback((h: Hit, autoplay: boolean, atMs = h.seekMs) => {
    const v = video.current;
    if (!v || !h.recording.videoUrl) return;
    const go = () => {
      v.currentTime = atMs / 1000;
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
    if (window.innerWidth < 1024) video.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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
            placeholder="What was said or seen? — “a dark hallway with a monster”"
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

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
        <button
          type="button"
          aria-pressed={visual}
          onClick={() => nav({ visual: visual ? null : "1" })}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 font-medium transition-colors",
            visual ? "border-accent/50 bg-accent/15 text-accent-ink" : "border-line-strong text-ink-muted hover:text-ink",
          )}
        >
          <Eye className="size-3.5" aria-hidden /> Scenes · experimental {visual ? "on" : "off"}
        </button>
        <span className="text-ink-faint">
          {visual
            ? "Also matching what frames look like. Approximate — it can’t confirm actions like jumps, kills or aces."
            : "Searching what was said, recording names and games you set. Turn on Scenes to also match what frames look like."}
        </span>
      </div>

      {judge && (
        <div role="note" aria-label="Search scope" className="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-[12.5px] text-accent-ink">
          <p>
            <span className="font-medium">Prepared demo · one recording.</span> Searching only {demo ? `“${demo.recording.title}”` : "the approved recording"}. The rest of your library isn’t searched here, so moments and scenes from other recordings won’t appear.
          </p>
          <Link href={libraryHref} className="mt-1 inline-block font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline">
            Leave the demo: search your whole library
          </Link>
        </div>
      )}
      <div className={cn("mt-4 flex flex-wrap items-end gap-3 text-[12.5px]", (judge || (emptyIndex && !hasFilters)) && "hidden")} aria-label="Filters">
        <label className="flex min-w-0 flex-col gap-1 text-ink-faint">
          Recording
          <select value={params.get("recording") ?? ""} onChange={(e) => nav({ recording: e.target.value || null })} className="h-9 max-w-[16rem] rounded-lg border border-line bg-surface-2 px-2 text-ink">
            <option value="">All searchable</option>
            {known?.facets.recordings.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </label>
        {(known?.facets.games.length ?? 0) > 0 && (
          <label className="flex flex-col gap-1 text-ink-faint">
            Game
            <select value={params.get("game") ?? ""} onChange={(e) => nav({ game: e.target.value || null })} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-ink">
              <option value="">Any game</option>
              {known!.facets.games.map((g) => (
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

      {known && demo && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-faint">
          <Mic className="size-3.5" aria-hidden />
          Searching {demo.lines} machine-transcribed line{demo.lines === 1 ? "" : "s"} from this one recording, on this computer.
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" aria-hidden />
            {!known.visual.available
              ? `Scene search unavailable — ${known.visual.reason}`
              : !demo.frames
                ? "Scene search (experimental): this recording isn’t visually indexed."
                : `Scene search (experimental): ${demo.frames} frames from this recording${visual ? ", approximate matches." : " — off. Turn on Scenes to include them."}`}
          </span>
        </p>
      )}
      {known && !demo && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-faint">
          <span className="font-medium text-ink-muted">Whole library.</span>
          <Mic className="size-3.5" aria-hidden />
          Searching {known.index.segments} machine-transcribed line{known.index.segments === 1 ? "" : "s"} from {known.index.recordings} recording{known.index.recordings === 1 ? "" : "s"}, on this computer.
          {known.semantic.available ? " Matches by words and by meaning." : ` Keyword matching only — ${known.semantic.reason}`}
          {known.index.flagged > 0 && ` ${known.index.flagged} line${known.index.flagged === 1 ? "" : "s"} you marked wrong ${known.index.flagged === 1 ? "is" : "are"} excluded.`}
          <span className="inline-flex items-center gap-1.5">
            <Eye className="size-3.5" aria-hidden />
            {!known.visual.available
              ? `Scene search unavailable — ${known.visual.reason}`
              : !known.visual.frames
                ? "Scene search (experimental): no recordings are visually indexed yet — open one and choose Index visuals."
                : `Scene search (experimental): ${known.visual.frames} frames from ${known.visual.recordings} visually indexed recording${known.visual.recordings === 1 ? "" : "s"}${visual ? ", approximate matches." : " — off. Turn on Scenes to include them."}`}
          </span>
        </p>
      )}
      {q.trim() && loading && (
        <p role="status" className="mt-8 flex items-center gap-2 text-[13.5px] text-ink-muted">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Searching for “{q}”…
        </p>
      )}
      {error && (
        <div role="alert" className="mt-8 flex flex-wrap items-center gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-[13.5px] text-danger">
          <CircleAlert className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">Couldn’t search: {error}</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="h-8 rounded-lg border border-danger/40 px-3 font-medium text-ink hover:bg-danger/15">
            Retry
          </button>
        </div>
      )}

      {!q.trim() && known && !emptyIndex && !judge && (
        <ul aria-label="Search tips" className="mt-6 grid gap-2 text-[12.5px] leading-relaxed text-ink-muted sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Exact words", "Type a phrase someone said, like “behind you”."],
            known.semantic.available
              ? ["Or the gist", "Approximate wording works too — describe what was said in your own words."]
              : ["Use their words", "Matching by meaning isn’t set up, so search for words that were actually said."],
            ["Describe a scene", "With Scenes on, “a dark hallway with a monster” finds frames that look alike. Approximate; not actions."],
            ["Opens at the second", "Each result plays from the real timestamp in the recording."],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
              <span className="block font-medium text-ink">{title}</span>
              {body}
            </li>
          ))}
        </ul>
      )}

      {emptyIndex && (!q.trim() || (data && results.length === 0)) && (
        <div className="mt-10 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center" role={q.trim() ? "status" : undefined}>
          <Mic className="mx-auto size-6 text-accent-ink" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 text-[15px] font-medium text-ink">{q.trim() ? "There’s nothing indexed to search yet" : "Nothing to search yet"}</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-ink-muted">Recall searches what was said in your recordings, and optionally what scenes looked like, so a recording needs a transcript or a visual index first.</p>
          <ol className="mx-auto mt-4 max-w-sm space-y-1 text-left text-[13px] text-ink-muted">
            <li><span className="mr-2 font-mono text-[11.5px] text-accent-ink">1</span>Open a recording in your Library.</li>
            <li><span className="mr-2 font-mono text-[11.5px] text-accent-ink">2</span>Choose <span className="text-ink">Transcribe speech</span> under the player, or <span className="text-ink">Index visuals</span> (experimental).</li>
            <li><span className="mr-2 font-mono text-[11.5px] text-accent-ink">3</span>Come back here and search — results open at the exact second.</li>
          </ol>
          <Link href="/library" className={buttonClass("secondary", "sm", "mt-5")}>Go to Library</Link>
        </div>
      )}

      {q.trim() && data && results.length === 0 && !emptyIndex && (
        <div className="mt-10 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center" role="status">
          <p className="text-[15px] font-medium text-ink">{visual ? `No similar scene or line found for “${data.query}”` : `No moments match “${data.query}”`}</p>
          {demo ? (
            <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-ink-muted">
              The prepared demo searches only “{demo.recording.title}”{visual && demo.frames ? ` (its ${demo.lines} lines and ${demo.frames} indexed frames)` : ""}. Other recordings in your library aren’t included here.{" "}
              <Link href={libraryHref} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                Search your whole library for “{data.query}”
              </Link>
            </p>
          ) : (
            <>
              <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-ink-muted">
                {!data.visual.frames
                  ? "Recall found nothing said or named like this, and no recordings are visually indexed, so it can’t search what was on screen."
                  : visual
                    ? `Nothing said, named, or shown in the ${data.visual.recordings} visually indexed recording${data.visual.recordings === 1 ? "" : "s"} is close enough. METAL doesn’t show weak guesses as matches.`
                    : "Nothing said or named matches. Turn on Scenes to also search what was on screen."}
                {hasFilters ? " Your filters may be hiding results." : visual && data.visual.frames ? "" : " Try other words, or describe the scene differently."}
              </p>
              {(data.games.genres.length > 0 || data.games.games.length > 0) && (
                <p className="mx-auto mt-3 max-w-md text-[13px] text-ink-muted">
                  {data.games.tagged
                    ? `None of the ${data.games.tagged} recording${data.games.tagged === 1 ? "" : "s"} with a game set ${data.games.genres.length ? `is a ${data.games.genres.join(" or ")}` : "is that game"}.`
                    : "No recordings have a game set yet."}{" "}
                  Recall finds games and genres only from the game you set on a recording (open it and choose Set game) — it doesn’t guess the game from the video.
                </p>
              )}
              {visual && data.visual.frames > 0 && !hasFilters && (
                <p className="mx-auto mt-3 max-w-md text-[13px] text-ink-muted">
                  Try describing what you see — the place, colours or objects — such as “jungle cliff” or “a dark hallway with a monster”, rather than a single word.
                  <span className="mt-1 block text-[12px] text-ink-faint">These are phrasing tips, not guaranteed matches. Scene matches are always approximate.</span>
                </p>
              )}
            </>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div className="min-w-0">
            <p className="mb-3 text-[13px] text-ink-muted" aria-live="polite">
              {results.length} moment{results.length === 1 ? "" : "s"} for “{data!.query}”
            </p>
            {data!.ambiguous && (
              <p className="mb-3 flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> No close matches. These are only loosely related — check before relying on them.
              </p>
            )}
            {data!.visual.eventQuery && results.some((h) => h.visual) && (
              <p className="mb-3 flex items-start gap-2 rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-[12.5px] text-warn">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> METAL can’t recognise kills, deaths, aces or round results in video. Visual matches below only look similar to your words.
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
                        <span className="font-mono text-[12px] tabular-nums text-accent-ink">{h.lines.length || h.visual ? timecode(h.seekMs) : "whole recording"}</span>
                        <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[11px] font-medium", badge(h).cls)}>{badge(h).label}</span>
                      </div>
                      {h.visual && (
                        <div className="mt-2.5 flex gap-1.5">
                          {h.visual.frames.map((f) => (
                            // eslint-disable-next-line @next/next/no-img-element -- local evidence frame, served by id
                            <img key={f.frameId} src={frameUrl(f.frameId)} alt={`Frame at ${timecode(f.tMs)}`} loading="lazy" className="h-14 w-auto rounded-md border border-line object-cover" />
                          ))}
                        </div>
                      )}
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
                    {/* The guided demo plays here; the recording page and new stories belong to the full app. */}
                    {!judge && (
                      <>
                        <Link href={`/recordings/${current.recordingId}?t=${current.seekMs}`} className="inline-flex items-center gap-1 font-medium text-ink-muted hover:text-ink">
                          Open recording <ExternalLink className="size-3.5" aria-hidden />
                        </Link>
                        <StartStory hit={current} />
                      </>
                    )}
                  </div>
                </div>
                {current.visual && (
                  <div className="mt-3">
                    <p className="text-[12px] text-ink-faint">Matching frames — click to play from that moment</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {current.visual.frames.map((f) => (
                        <button key={f.frameId} type="button" onClick={() => cue(current, true, Math.max(0, f.tMs - 500))} className="group text-left">
                          {/* eslint-disable-next-line @next/next/no-img-element -- local evidence frame, served by id */}
                          <img src={frameUrl(f.frameId)} alt={`Frame at ${timecode(f.tMs)}`} className="h-20 w-auto rounded-lg border border-line object-cover group-hover:border-accent/60" />
                          <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-ink-faint">
                            {timecode(f.tMs)} · {f.similarity.toFixed(2)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                {current.lines.length > 0 && (
                  <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
                    Machine transcription (whisper.cpp) — words may be wrong. A match shows what was said, not what happened on screen.
                  </p>
                )}
                {current.visual && (
                  <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
                    Approximate visual match ({current.visual.model}, frames every {(current.visual.intervalMs / 1000).toFixed(1)} s, so the moment is within about ±{(current.visual.intervalMs / 2000).toFixed(1)} s). It means these frames look like your description — it doesn’t confirm actions, kills, or events.
                  </p>
                )}
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
