"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, CircleHelp, Clapperboard, Film, Mic, PencilLine, Play, Scissors, Sparkles, Star, Waves } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, useMemo, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { EASE_OUT } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/format";
import { clock, clockSec, longDay, span } from "@/lib/timemachine/format";
import { TIME_SOURCE_LABEL, type SessionDetail, type TimelineMoment, type TimelineRecording } from "@/lib/timemachine/types";
import { tmSend } from "./use-tm";

const CONFIDENCE: Record<TimelineMoment["confidence"], string> = { strong: "Strong signal", moderate: "Moderate signal", weak: "Weak signal" };

/** `judge`: the guided demo's server-scoped view (approved recordings only); links stay in that scope. */
export function SessionView({ data, judge = false }: { data: SessionDetail; judge?: boolean }) {
  const router = useRouter();
  const { summary: s, recordings, moments } = data;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(moments.filter((m) => m.favorite).map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(s.title);
  const recById = useMemo(() => new Map(recordings.map((r) => [r.id, r])), [recordings]);

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    const r = await tmSend(url, method, body);
    setBusy(false);
    if (r.error) setError(r.error);
    return r;
  }
  const edit = async (body: unknown) => {
    const r = await call(`/api/sessions/${s.id}`, "PATCH", body);
    if (!r.error) router.refresh();
    return r;
  };
  async function favorite(m: TimelineMoment) {
    const r = await call(`/api/clips/${m.id}`, "PATCH", { action: m.favorite ? "unfavorite" : "favorite" });
    if (!r.error) {
      setSelected((cur) => {
        const next = new Set(cur);
        if (m.favorite) next.delete(m.id);
        else next.add(m.id);
        return next;
      });
      router.refresh();
    }
  }
  async function toStudio() {
    const ids = moments.filter((m) => selected.has(m.id)).map((m) => m.id);
    const r = await call("/api/stories", "POST", { sessionId: s.id, momentIds: ids });
    const id = (r.json as { id?: string } | null)?.id;
    if (!r.error && id) router.push(`/studio?story=${id}`);
  }

  const reliveParams = new URLSearchParams();
  if (selected.size) reliveParams.set("moments", moments.filter((m) => selected.has(m.id)).map((m) => m.id).join(","));
  if (judge) reliveParams.set("judge", "1");
  const relivePick = reliveParams.size ? `?${reliveParams.toString().replace(/%2C/g, ",")}` : "";

  return (
    <article>
      {/* ── Hero ── */}
      <header className="relative isolate overflow-hidden border-b border-line">
        {s.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local keyframe
          <img src={s.coverUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-55" />
        )}
        <div aria-hidden className="grain absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-bg via-bg/75 to-bg/20" />
        <div aria-hidden className="scrim-b absolute inset-0 -z-10" />
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-8 md:pb-14">
          <Link href="/sessions" className="inline-flex items-center gap-2 rounded-lg py-1 text-[13px] font-medium text-ink-muted hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Time Machine
          </Link>
          {judge && (
            <p className="mt-4 flex w-fit flex-wrap items-center gap-x-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[12px] text-accent-ink">
              Prepared demo: approved recordings only, changes are off ·
              <Link href={`/sessions/${s.id}`} className="font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline">
                Leave the demo: open the full night
              </Link>
            </p>
          )}
          <p className="mt-10 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted md:mt-16">
            {s.timeKnown ? (
              <>
                <span>{longDay(s.startedAt)}</span>
                <span className="font-mono">
                  {clock(s.startedAt)} – {clock(s.endedAt)}
                </span>
              </>
            ) : (
              <span>Recording times unknown</span>
            )}
            {s.game && <span className="rounded-full border border-line-strong px-2 py-0.5">{s.game}</span>}
            {s.approximate && s.timeKnown && (
              <span className="rounded-full border border-warn/25 bg-warn/10 px-2 py-0.5 font-medium text-warn" title="Some times come from file dates or are unknown">
                Approximate times
              </span>
            )}
          </p>
          {editing ? (
            <form
              className="mt-3 flex max-w-2xl flex-wrap items-center gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await edit({ action: "rename", title: title.trim() || null });
                if (!r.error) setEditing(false);
              }}
            >
              <label className="sr-only" htmlFor="session-title">
                Session name
              </label>
              <input
                id="session-title"
                autoFocus
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && (setEditing(false), setTitle(s.title))}
                className="h-12 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface-2/80 px-3 font-display text-[1.6rem] text-ink"
              />
              <button type="submit" disabled={busy} className={buttonClass("primary", "md")}>
                Save
              </button>
              <button type="button" onClick={() => (setEditing(false), setTitle(s.title))} className={buttonClass("ghost", "md")}>
                Cancel
              </button>
            </form>
          ) : (
            <h1 className="mt-3 flex flex-wrap items-baseline gap-3 font-display text-[clamp(2.2rem,5.5vw,4.2rem)] leading-[1.02] tracking-[-0.02em] text-ink">
              {s.title}
              {!judge && (
                <button type="button" onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-3 hover:text-ink" aria-label="Rename session">
                  <PencilLine className="size-5" aria-hidden />
                </button>
              )}
            </h1>
          )}
          <p className="mt-4 max-w-2xl text-[14.5px] leading-relaxed text-ink-muted">
            {recordings.length} recording{recordings.length === 1 ? "" : "s"}, {span(s.footageMs)} of footage.{" "}
            {s.analyzedCount === 0
              ? "Nothing here has been analyzed yet, so there are no moments — analyze a recording to find them."
              : `${s.momentCount} moment${s.momentCount === 1 ? "" : "s"} found from loudness and picture changes${s.transcriptLines ? `, with ${s.transcriptLines} transcript line${s.transcriptLines === 1 ? "" : "s"}` : ""}.`}
            {!s.titleIsCustom && s.timeKnown && !judge && " The name is just the day and time — rename it if you like."}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            {moments.length > 0 ? (
              <Link href={`/sessions/${s.id}/relive${relivePick}`} className={buttonClass("primary", "md")}>
                <Play className="size-4 fill-current" aria-hidden /> Relive {selected.size ? `${selected.size} selected` : "this night"}
              </Link>
            ) : (
              <span className={buttonClass("primary", "md", "pointer-events-none opacity-45")} aria-disabled="true" aria-describedby="relive-hint">
                <Play className="size-4" aria-hidden /> Relive this night
              </span>
            )}
            {!judge && (
              <button type="button" disabled={busy || selected.size === 0} onClick={toStudio} aria-describedby="relive-hint" className={buttonClass("secondary", "md", "bg-black/40 backdrop-blur")}>
                <Scissors className="size-4" aria-hidden /> Send {selected.size || ""} to Story Studio
              </button>
            )}
          </div>
          <p id="relive-hint" className="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-ink-muted">
            {moments.length === 0
              ? "Relive needs moments. Open a recording below and choose Find moments — then you can play the night back here."
              : selected.size === 0
                ? `Relive plays every moment in order, crossfading between recordings. Select moments below to relive${judge ? "" : " or send"} only those.`
                : `${selected.size} moment${selected.size === 1 ? "" : "s"} selected.${judge ? "" : " Relive them, or send them to Story Studio to make a montage."}`}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-14 px-4 py-10 sm:px-8">
        <TimeRail data={data} judge={judge} />

        {/* ── Moments ── */}
        <section aria-labelledby="moments-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="moments-heading" className="text-[18px] font-semibold tracking-[-0.01em] text-ink">
                Moments, in the order they happened
              </h2>
              <p className="mt-1 max-w-2xl text-[13px] text-ink-muted">
                Found from measured signals. METAL doesn’t know who won or what was said beyond the machine transcript, which can contain errors. Select moments to relive them{judge ? "" : " or send them to Story Studio"}.
              </p>
            </div>
            {moments.length > 0 && (
              <div className="flex gap-2 text-[12.5px]">
                <button type="button" onClick={() => setSelected(new Set(moments.map((m) => m.id)))} className="font-medium text-accent-ink hover:text-white">
                  Select all
                </button>
                <span className="text-ink-faint">·</span>
                <button type="button" onClick={() => setSelected(new Set())} className="font-medium text-ink-muted hover:text-ink">
                  Clear
                </button>
              </div>
            )}
          </div>
          {moments.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
              <Sparkles className="mx-auto size-6 text-accent-ink" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 text-[14.5px] font-medium text-ink">No moments yet</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-ink-muted">Open a recording below and run Smart Clip analysis. Its moments will appear here on the session’s timeline.</p>
            </div>
          ) : (
            <ol className="mt-6 grid gap-4 md:grid-cols-2">
              {moments.map((m, i) => (
                <MomentCard
                  key={m.id}
                  m={m}
                  i={i}
                  rec={recById.get(m.recordingId)}
                  selected={selected.has(m.id)}
                  busy={busy}
                  judge={judge}
                  sessionId={s.id}
                  onSelect={() =>
                    setSelected((cur) => {
                      const next = new Set(cur);
                      if (next.has(m.id)) next.delete(m.id);
                      else next.add(m.id);
                      return next;
                    })
                  }
                  onFavorite={() => favorite(m)}
                />
              ))}
            </ol>
          )}
        </section>

        {/* ── Grouping ── */}
        <section aria-labelledby="group-heading" className="rounded-3xl border border-line bg-surface-2/50 p-5 sm:p-6">
          <h2 id="group-heading" className="text-[16px] font-semibold text-ink">
            Recordings in this session
          </h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            {s.locked
              ? "You’ve edited this session, so automatic grouping leaves it as it is."
              : "Grouped automatically by recording time. Any change you make here is kept."}
          </p>
          <ul className="mt-4 divide-y divide-line">
            {recordings.map((r, i) => (
              <RecordingRow
                key={r.id}
                r={r}
                canSplit={i > 0}
                busy={busy}
                readOnly={judge}
                others={data.others}
                onSplit={() => edit({ action: "split", atRecordingId: r.id })}
                onMove={(to) => edit({ action: "move", recordingId: r.id, to })}
              />
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5 text-[13px]">
            {data.others.length > 0 && !judge && (
              <label className="flex items-center gap-2 text-ink-muted">
                Merge into
                <select
                  value=""
                  disabled={busy}
                  onChange={async (e) => {
                    const into = e.target.value;
                    if (!into) return;
                    const r = await call(`/api/sessions/${s.id}`, "PATCH", { action: "merge", into });
                    if (!r.error) router.push(`/sessions/${into}`);
                  }}
                  className="h-9 max-w-[16rem] rounded-lg border border-line bg-surface-2 px-2 text-ink"
                >
                  <option value="">Choose a session…</option>
                  {data.others.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {s.locked && !judge && (
              <button type="button" disabled={busy} onClick={() => edit({ action: "reset" })} className={buttonClass("ghost", "sm")}>
                Return to automatic grouping
              </button>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}

/** Wall-clock rail: recordings to scale, moments as glowing ticks. */
function TimeRail({ data, judge }: { data: SessionDetail; judge: boolean }) {
  const reduce = useReducedMotion();
  const dated = data.recordings.filter((r) => r.startAt !== null);
  const undated = data.recordings.filter((r) => r.startAt === null);
  if (!dated.length && !undated.length) return null;
  if (!dated.length) {
    return (
      <p className="flex items-start gap-2 rounded-2xl border border-dashed border-line-strong px-5 py-4 text-[13px] text-ink-muted">
        <CircleHelp className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
        None of these recordings has a known recording time, so there’s no clock to place them on. They’re listed in the order you added them.
      </p>
    );
  }
  const t0 = Math.min(...dated.map((r) => r.startAt!), data.summary.startedAt);
  const t1 = Math.max(...dated.map((r) => r.startAt! + r.durationMs), data.summary.endedAt, t0 + 60_000);
  const pct = (t: number) => ((t - t0) / (t1 - t0)) * 100;
  const ticks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);

  return (
    <section aria-label="Session timeline">
      <h2 className="sr-only">Timeline</h2>
      {dated.length > 0 && (
        <div className="relative rounded-3xl border border-line bg-[radial-gradient(120%_140%_at_0%_0%,rgb(139_92_246/0.12),transparent_60%)] bg-surface-2/60 px-5 pb-5 pt-8 sm:px-8">
          <div className="relative h-24">
            <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
            {dated.map((r) => (
              <RecLink
                key={r.id}
                href={judge ? null : `/recordings/${r.id}`}
                title={`${r.title} · ${clock(r.startAt!)} · ${span(r.durationMs)}`}
                className="group absolute top-1/2 h-10 min-w-2 -translate-y-1/2 overflow-hidden rounded-lg border border-white/10 bg-surface-4 ring-accent/60 transition-shadow hover:ring-2 focus-visible:ring-2"
                style={{ left: `${pct(r.startAt!)}%`, width: `max(8px, ${pct(r.startAt! + r.durationMs) - pct(r.startAt!)}%)` }}
              >
                {r.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- local poster
                  <img src={r.posterUrl} alt="" className="size-full object-cover opacity-70 transition-opacity group-hover:opacity-100" />
                )}
                <span className="sr-only">
                  {r.title}, {clock(r.startAt!)}
                </span>
              </RecLink>
            ))}
            {data.moments
              .filter((m) => m.at !== null)
              .map((m, i) => (
                <motion.span
                  key={m.id}
                  aria-hidden
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.5, delay: 0.2 + Math.min(i, 20) * 0.03, ease: EASE_OUT }}
                  className={cn("absolute top-0 h-full w-[3px] -translate-x-1/2 origin-center rounded-full", m.favorite ? "bg-accent-ink shadow-[0_0_14px_var(--violet-400)]" : "bg-accent/70")}
                  style={{ left: `${pct(m.at!)}%` }}
                />
              ))}
          </div>
          <div className="mt-3 flex justify-between font-mono text-[11px] text-ink-faint" aria-hidden>
            {ticks.map((t) => (
              <span key={t}>{clock(t)}</span>
            ))}
          </div>
        </div>
      )}
      {undated.length > 0 && (
        <p className="mt-3 flex items-start gap-2 text-[12.5px] text-ink-muted">
          <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden />
          {undated.length} recording{undated.length === 1 ? " has" : "s have"} no known recording time, so {undated.length === 1 ? "it isn’t" : "they aren’t"} placed on the clock. Their moments are listed after the timed ones.
        </p>
      )}
    </section>
  );
}

function MomentCard({
  m,
  i,
  rec,
  selected,
  busy,
  judge,
  sessionId,
  onSelect,
  onFavorite,
}: {
  m: TimelineMoment;
  i: number;
  rec?: TimelineRecording;
  selected: boolean;
  busy: boolean;
  /** Guided demo: the thumbnail relives this moment in scope instead of opening the full recording page. */
  judge: boolean;
  sessionId: string;
  onSelect: () => void;
  onFavorite: () => void;
}) {
  const reduce = useReducedMotion();
  const approx = rec?.timeSource === "file-date";
  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0.2, y: { duration: 0 } } : { duration: 0.45, delay: Math.min(i, 8) * 0.04, ease: EASE_OUT }}
      className={cn("group relative flex min-w-0 gap-3 rounded-2xl border bg-surface-2/70 p-3 transition-colors sm:gap-4", selected ? "border-accent/50 bg-accent/[0.06]" : "border-line")}
    >
      <Link
        href={judge ? `/sessions/${sessionId}/relive?moments=${m.id}&judge=1` : `/recordings/${m.recordingId}?t=${m.startMs}`}
        className="relative aspect-video w-28 shrink-0 self-start overflow-hidden rounded-xl bg-surface-3 sm:w-44"
        aria-label={`Play “${m.title}” at ${timecode(m.startMs)} in ${rec?.title ?? "the recording"}`}
      >
        {m.thumbUrl || rec?.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local keyframe
          <img src={(m.thumbUrl ?? rec?.posterUrl)!} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <Film className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
        )}
        <span className="absolute bottom-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10.5px] text-white">
          {timecode(m.startMs)} · {Math.round((m.endMs - m.startMs) / 1000)}s
        </span>
        <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-6 fill-white text-white" />
        </span>
      </Link>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-[11.5px] text-ink-faint">
          {m.at !== null ? (
            <span className="font-mono" title={rec?.timeSource ? `Time ${TIME_SOURCE_LABEL[rec.timeSource]}` : undefined}>
              {approx ? "≈ " : ""}
              {clockSec(m.at)}
            </span>
          ) : (
            "Time unknown"
          )}{" "}
          · {CONFIDENCE[m.confidence]}
        </p>
        <h3 className="mt-0.5 truncate text-[14.5px] font-medium text-ink">{m.title}</h3>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {m.evidence.slice(0, 3).map((e, k) => (
            <li key={k} className="flex items-center gap-1 rounded-full border border-line bg-surface-3/70 px-2 py-0.5 text-[11px] text-ink-muted" title={e.detail}>
              {e.kind.startsWith("loudness") ? <Waves className="size-3" aria-hidden /> : <Clapperboard className="size-3" aria-hidden />}
              {e.label}
            </li>
          ))}
        </ul>
        {m.speech[0] && (
          <p className="mt-2 line-clamp-2 text-[12.5px] italic text-ink-muted">
            <Mic className="mr-1 inline size-3 -translate-y-px not-italic text-ink-faint" aria-hidden />“{m.speech.map((g) => g.text).join(" ")}”
            <span className="not-italic text-ink-faint"> — machine transcript</span>
          </p>
        )}
        <p className="mt-1.5 truncate text-[11.5px] text-ink-faint">{rec?.title}</p>
      </div>
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={selected ? `Deselect “${m.title}”` : `Select “${m.title}”`}
          className={cn("grid size-8 place-items-center rounded-lg border transition-colors", selected ? "border-accent bg-accent text-white" : "border-line-strong text-transparent hover:text-ink-faint")}
        >
          <Check className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onFavorite}
          disabled={busy || judge}
          title={judge ? "Favorites are off in the prepared demo" : undefined}
          aria-pressed={m.favorite}
          aria-label={m.favorite ? `Remove “${m.title}” from favorites` : `Mark “${m.title}” as a favorite`}
          className={cn("grid size-8 place-items-center rounded-lg transition-colors", m.favorite ? "text-accent-ink" : "text-ink-faint hover:text-ink")}
        >
          <Star className={cn("size-4", m.favorite && "fill-current")} aria-hidden />
        </button>
      </div>
    </motion.li>
  );
}

function RecordingRow({
  r,
  canSplit,
  busy,
  readOnly,
  others,
  onSplit,
  onMove,
}: {
  r: TimelineRecording;
  canSplit: boolean;
  busy: boolean;
  /** Guided demo: no regrouping and no way into the full recording page. */
  readOnly: boolean;
  others: SessionDetail["others"];
  onSplit: () => void;
  onMove: (to: string | null) => void;
}) {
  const status = r.analysis === "done" ? `${r.momentCount} moment${r.momentCount === 1 ? "" : "s"}` : r.analysis === "none" ? "Not analyzed" : r.analysis === "failed" ? "Analysis failed" : "Analyzing…";
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <RecLink href={readOnly ? null : `/recordings/${r.id}`} className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-surface-3 ring-1 ring-line">
        {r.posterUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local poster
          <img src={r.posterUrl} alt="" className="size-full object-cover" />
        )}
        {!readOnly && <span className="sr-only">Open {r.title}</span>}
      </RecLink>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-ink">{r.title}</span>
        <span className="block text-[12px] text-ink-faint">
          {r.startAt !== null && r.timeSource ? (
            <>
              {r.timeSource === "file-date" ? "≈ " : ""}
              {clock(r.startAt)} <span title={TIME_SOURCE_LABEL[r.timeSource]}>({TIME_SOURCE_LABEL[r.timeSource]})</span>
            </>
          ) : (
            "Recording time unknown"
          )}{" "}
          · {span(r.durationMs)} · {status}
          {r.transcript === "done" && " · transcribed"}
        </span>
      </span>
      {!readOnly && (
        <div className="flex w-full flex-wrap items-center gap-2 pl-[5.75rem] sm:w-auto sm:pl-0">
          <Link href={`/recordings/${r.id}#povs`} className={buttonClass("ghost", "sm")} title="Find other players’ recordings of this">
            Other POVs
          </Link>
          {canSplit && (
            <button type="button" disabled={busy} onClick={onSplit} className={buttonClass("ghost", "sm")} title="Start a new session from this recording onward">
              Split here
            </button>
          )}
          <label>
            <span className="sr-only">Move {r.title}</span>
            <select
              value=""
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value;
                if (v) onMove(v === "out" ? null : v);
              }}
              className="h-9 max-w-[12rem] rounded-lg border border-line bg-surface-2 px-2 text-[12.5px] text-ink"
            >
              <option value="">Move…</option>
              <option value="new">To a new session</option>
              <option value="out">Out of this session</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  To {o.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </li>
  );
}

/** A link in the full app; plain content in the guided demo, so a click can't leave the prepared scope by accident. */
function RecLink({ href, ...p }: { href: string | null } & Omit<ComponentProps<typeof Link>, "href">) {
  return href ? <Link href={href} {...p} /> : <span className={p.className} style={p.style} title={p.title}>{p.children}</span>;
}
