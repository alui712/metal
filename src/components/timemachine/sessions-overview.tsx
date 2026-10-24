"use client";

import { motion, useReducedMotion } from "motion/react";
import { CalendarClock, CircleHelp, Clapperboard, Film, Layers, Mic, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { EASE_OUT } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import { clock, day, isoDay, month, span } from "@/lib/timemachine/format";
import { GAP_CHOICES, TIME_SOURCE_LABEL, type SessionSummary, type TimelineRecording, type TimeMachineOverview } from "@/lib/timemachine/types";
import { tmSend } from "./use-tm";

/** Real sessions as a vertical "time river": nights in order, newest first. */
export function SessionsOverview({ data }: { data: TimeMachineOverview }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [game, setGame] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      data.sessions.filter(
        (s) => (!game || s.game === game) && (!(from || to) || s.timeKnown) && (!from || isoDay(s.endedAt) >= from) && (!to || isoDay(s.startedAt) <= to),
      ),
    [data.sessions, game, from, to],
  );
  const byMonth = useMemo(() => {
    const m = new Map<string, SessionSummary[]>();
    for (const s of shown) {
      const k = s.timeKnown ? month(s.startedAt) : "Date unknown";
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [shown]);

  async function act(url: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    const r = await tmSend(url, method, body);
    if (r.error) setError(r.error);
    setBusy(false);
    router.refresh();
  }

  const filtered = Boolean(game || from || to);

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 text-[12.5px]" aria-label="Filters and grouping">
        {data.games.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Game">
            {[null, ...data.games].map((g) => (
              <button
                key={g ?? "all"}
                type="button"
                aria-pressed={game === g}
                onClick={() => setGame(g)}
                className={cn("h-9 rounded-full border px-3.5 font-medium transition-colors", game === g ? "border-accent/50 bg-accent/15 text-accent-ink" : "border-line text-ink-muted hover:text-ink")}
              >
                {g ?? "All games"}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1 text-ink-faint">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-ink [color-scheme:dark]" />
        </label>
        <label className="flex flex-col gap-1 text-ink-faint">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-ink [color-scheme:dark]" />
        </label>
        {filtered && (
          <button type="button" onClick={() => (setGame(null), setFrom(""), setTo(""))} className="h-9 px-2 font-medium text-accent-ink hover:text-white">
            Clear
          </button>
        )}
        <label className="ml-auto flex flex-col gap-1 text-ink-faint">
          New session after a break of
          <select
            value={data.gapMinutes}
            disabled={busy}
            onChange={(e) => act("/api/sessions", "PATCH", { gapMinutes: Number(e.target.value) })}
            className="h-9 rounded-lg border border-line bg-surface-2 px-2 text-ink"
          >
            {GAP_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {error}
        </p>
      )}

      {/* River */}
      {data.sessions.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-line-strong px-6 py-14 text-center">
          <CalendarClock className="mx-auto size-7 text-accent-ink" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 text-[16px] font-medium text-ink">No sessions yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-ink-muted">
            Sessions are built from recordings with a known recording time. Record with OBS or watch a recordings folder — imported files without a date wait below.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-10 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center text-[13.5px] text-ink-muted" role="status">
          No sessions match these filters.
        </p>
      ) : (
        <ol className="relative mt-10 space-y-12 pl-6 sm:pl-10" aria-label="Sessions">
          <span aria-hidden className="absolute bottom-2 left-[7px] top-2 w-px bg-gradient-to-b from-accent/60 via-line-strong to-transparent sm:left-[15px]" />
          {byMonth.map(([m, list]) => (
            <li key={m}>
              <h2 className="relative -ml-6 mb-5 flex items-center gap-3 text-[12px] font-medium uppercase tracking-[0.2em] text-ink-faint sm:-ml-10">
                <span aria-hidden className="grid size-[15px] place-items-center rounded-full border border-accent/50 bg-bg sm:size-[31px]">
                  <span className="size-1.5 rounded-full bg-accent shadow-[0_0_12px_var(--violet-500)]" />
                </span>
                {m}
              </h2>
              <ul className="space-y-5">
                {list.map((s, i) => (
                  <motion.li
                    key={s.id}
                    // Same initial state on server and client (hydration); reduced motion only drops the movement.
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={reduce ? { duration: 0.2, y: { duration: 0 } } : { duration: 0.5, delay: Math.min(i, 6) * 0.05, ease: EASE_OUT }}
                  >
                    <SessionReel s={s} />
                  </motion.li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {/* Honest trays */}
      {(data.undated.length > 0 || data.ungrouped.length > 0) && (
        <section aria-labelledby="loose-heading" className="mt-16 rounded-3xl border border-line bg-surface-2/50 p-5 sm:p-6">
          <h2 id="loose-heading" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <CircleHelp className="size-4 text-warn" aria-hidden /> Not in a session
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            METAL only groups recordings by when they were actually recorded. These have no trustworthy recording time (import time doesn’t count), or you took them out of a session.
            Add them to a session yourself if you know when they’re from.
          </p>
          <ul className="mt-4 divide-y divide-line">
            {[...data.undated.map((r) => ({ r, why: "Recording time unknown" })), ...data.ungrouped.map((r) => ({ r, why: "Removed from its session" }))].map(({ r, why }) => (
              <LooseRow key={r.id} r={r} why={why} sessions={data.sessions} busy={busy} onMove={(to) => act("/api/sessions/none", "PATCH", { action: "move", recordingId: r.id, to })} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SessionReel({ s }: { s: SessionSummary }) {
  return (
    <Link
      href={`/sessions/${s.id}`}
      className="group relative isolate block overflow-hidden rounded-3xl border border-line bg-surface-2 transition-[border-color,transform] duration-500 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-accent/40 focus-visible:border-accent/60"
    >
      <div className="grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="relative aspect-[16/8] overflow-hidden bg-surface-3 sm:aspect-auto sm:min-h-[200px]">
          {s.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local keyframe
            <img src={s.coverUrl} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-[1.04]" />
          ) : (
            <Film className="absolute left-1/2 top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 text-ink-faint" strokeWidth={1.25} aria-hidden />
          )}
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent sm:bg-gradient-to-r sm:from-transparent sm:via-transparent sm:to-surface-2" />
          {s.timeKnown && (
            <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[11px] text-white/90 backdrop-blur sm:hidden">
              {clock(s.startedAt)} – {clock(s.endedAt)}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-2 p-5 sm:p-6">
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-ink-faint">
            {s.timeKnown ? (
              <>
                <span>{day(s.startedAt)}</span>
                <span className="hidden font-mono sm:inline">
                  {clock(s.startedAt)} – {clock(s.endedAt)}
                </span>
              </>
            ) : (
              <span>Recording times unknown</span>
            )}
            {s.approximate && s.timeKnown && <span className="rounded-full border border-warn/25 bg-warn/10 px-2 py-0.5 text-[10.5px] font-medium text-warn">Approximate times</span>}
            {s.locked && <span className="rounded-full border border-line px-2 py-0.5 text-[10.5px]">Edited</span>}
          </p>
          <h3 className="font-display text-[clamp(1.4rem,2.6vw,1.9rem)] leading-tight tracking-[-0.01em] text-ink">{s.title}</h3>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-muted">
            <li className="flex items-center gap-1.5"><Layers className="size-3.5 text-ink-faint" aria-hidden /> {s.recordingCount} recording{s.recordingCount === 1 ? "" : "s"} · {span(s.footageMs)}</li>
            <li className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-ink-faint" aria-hidden />
              {s.analyzedCount ? `${s.momentCount} moment${s.momentCount === 1 ? "" : "s"}` : "Not analyzed yet"}
            </li>
            {s.transcriptLines > 0 && <li className="flex items-center gap-1.5"><Mic className="size-3.5 text-ink-faint" aria-hidden /> {s.transcriptLines} transcript line{s.transcriptLines === 1 ? "" : "s"}</li>}
            {s.favoriteCount > 0 && <li className="flex items-center gap-1.5 text-accent-ink"><Star className="size-3.5 fill-current" aria-hidden /> {s.favoriteCount}</li>}
          </ul>
          <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-ink transition-colors group-hover:text-white">
            <Clapperboard className="size-4" aria-hidden /> Open this session
          </span>
        </div>
      </div>
    </Link>
  );
}

function LooseRow({ r, why, sessions, busy, onMove }: { r: TimelineRecording; why: string; sessions: SessionSummary[]; busy: boolean; onMove: (to: string) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-surface-3 ring-1 ring-line">
        {r.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local poster
          <img src={r.posterUrl} alt="" className="size-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <Link href={`/recordings/${r.id}`} className="block truncate text-[14px] font-medium text-ink hover:text-white">{r.title}</Link>
        <span className="block text-[12px] text-ink-faint">
          {why}
          {r.startAt !== null && r.timeSource && ` · ${day(r.startAt)} ${clock(r.startAt)} (${TIME_SOURCE_LABEL[r.timeSource]})`} · {span(r.durationMs)}
        </span>
      </span>
      <label className="w-full pl-[5.75rem] text-[12px] text-ink-faint sm:w-auto sm:pl-0">
        <span className="sr-only">Add {r.title} to a session</span>
        <select
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && onMove(e.target.value)}
          className="h-9 max-w-[14rem] rounded-lg border border-line bg-surface-2 px-2 text-[12.5px] text-ink"
        >
          <option value="">Add to session…</option>
          <option value="new">New session of its own</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.timeKnown ? ` · ${day(s.startedAt)}` : ""}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}
