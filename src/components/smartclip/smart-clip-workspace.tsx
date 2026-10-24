"use client";

import {
  AudioLines,
  Check,
  ChevronDown,
  CircleAlert,
  Eye,
  Film,
  LoaderCircle,
  Mic,
  Play,
  RotateCcw,
  ScanLine,
  Scissors,
  Sparkles,
  Square,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/format";
import { TranscriptPanel } from "./transcript-panel";
import { useSmartClip, type Analysis, type Suggestion } from "./use-smart-clip";

const STAGE: Record<string, string> = {
  audio: "Measuring audio loudness",
  scenes: "Detecting picture changes",
  keyframes: "Extracting keyframes",
  suggestions: "Ranking moments",
};

const CONFIDENCE: Record<Suggestion["confidence"], { label: string; cls: string }> = {
  strong: { label: "Strong signal", cls: "border-ok/30 bg-ok/10 text-ok" },
  moderate: { label: "Moderate signal", cls: "border-accent/40 bg-accent/10 text-accent-ink" },
  weak: { label: "Weak signal — review", cls: "border-line-strong text-ink-muted" },
};

const len = (s: { startMs: number; endMs: number }) => `${Math.round((s.endMs - s.startMs) / 1000)} s`;

/**
 * Player + Smart Clip for one ready recording. Previews play the exact
 * range from the same video METAL plays (the original, or its converted
 * copy on the same timeline). Accepted clips are cut from the original.
 */
export function SmartClipWorkspace({ recording }: { recording: { id: string; title: string; durationMs: number; videoUrl: string; posterUrl: string | null; proxied: boolean } }) {
  const video = useRef<HTMLVideoElement>(null);
  const { state, loadError, analyze, transcribe, act } = useSmartClip(recording.id);
  const [nowMs, setNowMs] = useState(0);
  const [preview, setPreview] = useState<{ id: string; endMs: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const dur = recording.durationMs;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onTime = () => {
      const ms = v.currentTime * 1000;
      setNowMs(ms);
      setPreview((p) => {
        if (p && ms >= p.endMs) {
          v.pause();
          return null;
        }
        return p;
      });
    };
    const onPause = () => setPreview((p) => (p && v.currentTime * 1000 < p.endMs - 300 ? null : p));
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", onPause);
    };
  }, []);

  function seek(ms: number, play = false) {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.max(0, ms) / 1000;
    setNowMs(ms);
    if (play) void v.play().catch(() => {});
  }

  function playRange(s: Suggestion) {
    if (preview?.id === s.id) {
      video.current?.pause();
      setPreview(null);
      return;
    }
    setSelected(s.id);
    setPreview({ id: s.id, endMs: s.endMs });
    seek(s.startMs, true);
    video.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function run(key: string, fn: () => Promise<string | null>) {
    setBusy(key);
    setError(null);
    const err = await fn();
    if (err) setError(err);
    setBusy(null);
  }

  const a = state?.analysis;
  const suggestions = state?.suggestions ?? [];
  const open = suggestions.filter((s) => s.status !== "dismissed");
  const dismissed = suggestions.filter((s) => s.status === "dismissed");

  return (
    <div>
      <video
        ref={video}
        src={recording.videoUrl}
        poster={recording.posterUrl ?? undefined}
        controls
        playsInline
        aria-label={recording.title}
        className="aspect-video w-full scroll-mt-6 rounded-2xl bg-black object-contain"
      />
      {a?.status === "done" && <Timeline analysis={a} suggestions={open} durationMs={dur} nowMs={nowMs} selected={selected} onSeek={(ms) => seek(ms)} onSelect={(s) => { setSelected(s.id); seek(s.startMs); }} />}

      <section id="smart-clip" aria-labelledby="smart-clip-heading" className="mt-8 scroll-mt-6 overflow-hidden rounded-3xl border border-line bg-surface-2/60">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <h2 id="smart-clip-heading" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <Scissors className="size-4 text-accent-ink" aria-hidden /> Smart Clip
            </h2>
            <AnalysisLine a={a} workerOnline={state?.workerOnline ?? true} loading={!state && !loadError} />
          </div>
          {a && (a.status === "none" || a.status === "failed") && (
            <Button onClick={() => run("analyze", analyze)} disabled={busy !== null}>
              {busy === "analyze" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              {a.status === "failed" ? "Try again" : "Find moments"}
            </Button>
          )}
          {a?.status === "done" && (
            <Button variant="ghost" size="sm" onClick={() => run("analyze", analyze)} disabled={busy !== null}>
              {busy === "analyze" ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />} Re-analyze
            </Button>
          )}
        </header>

        {a?.status === "none" && (
          <p className="flex items-start gap-2 px-5 py-4 text-[12.5px] leading-relaxed text-ink-faint">
            <Eye className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Runs on this computer with FFmpeg: it measures loudness and how much the picture changes, and saves timestamped keyframes. Nothing is uploaded
            anywhere.
          </p>
        )}
        {a?.status === "done" && a.signals && <SignalChips a={a} />}
        {error && (
          <p role="alert" className="flex items-start gap-2 border-t border-line px-5 py-3 text-[12.5px] text-danger">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {error}
          </p>
        )}
        {loadError && !state && <p className="px-5 py-4 text-[13px] text-danger">Couldn’t load Smart Clip. Is the METAL server running?</p>}

        {a?.status === "done" && (
          <div className="border-t border-line">
            {open.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-[15px] font-medium text-ink">No standout moments found</p>
                <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink-muted">
                  {a.hasAudio === false
                    ? "This recording has no audio, and the picture never changed sharply enough to suggest anything."
                    : a.counts.peaks + a.counts.jumps > 0
                      ? "METAL found loud moments, but they span most of this short recording — it’s already clip-length, so there’s nothing shorter to suggest."
                      : "Nothing was loud or sudden enough compared with the rest of the recording. METAL won’t invent highlights — scrub the video and clip it yourself."}
                  {dismissed.length > 0 && ` ${dismissed.length} dismissed.`}
                </p>
              </div>
            ) : (
              <ol aria-label="Suggested clips" className="divide-y divide-line">
                {open.map((s, i) => (
                  <SuggestionCard
                    key={s.id}
                    s={s}
                    rank={i + 1}
                    durationMs={dur}
                    nowMs={nowMs}
                    selected={selected === s.id}
                    previewing={preview?.id === s.id}
                    busy={busy}
                    onSelect={() => setSelected(s.id)}
                    onPreview={() => playRange(s)}
                    onAct={(body, key) => run(`${key}:${s.id}`, () => act(s.id, body))}
                    onSeek={seek}
                  />
                ))}
              </ol>
            )}
            {dismissed.length > 0 && (
              <div className="border-t border-line px-5 py-3">
                <button type="button" onClick={() => setShowDismissed((v) => !v)} aria-expanded={showDismissed} className="flex items-center gap-1.5 rounded-md text-[12.5px] font-medium text-ink-muted hover:text-ink">
                  <ChevronDown className={cn("size-3.5 transition-transform", showDismissed && "rotate-180")} aria-hidden /> {dismissed.length} dismissed
                </button>
                {showDismissed && (
                  <ul className="mt-2 space-y-1.5">
                    {dismissed.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-faint">
                        <span>
                          {s.title} · {timecode(s.startMs)}–{timecode(s.endMs)}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => run(`restore:${s.id}`, () => act(s.id, { action: "restore" }))} disabled={busy !== null}>
                          <Undo2 className="size-3.5" aria-hidden /> Restore
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </section>
      <TranscriptPanel
        t={state?.transcript}
        workerOnline={state?.workerOnline ?? true}
        nowMs={nowMs}
        busy={busy}
        onTranscribe={() => run("transcribe", transcribe)}
        onSeek={(ms) => seek(ms, true)}
      />
      {recording.proxied && a?.status === "done" && open.length > 0 && (
        <p className="mt-3 text-[12px] text-ink-faint">Previews play METAL’s converted copy, which keeps the original’s timing. Saved clips are cut from the original file.</p>
      )}
    </div>
  );
}

function AnalysisLine({ a, workerOnline, loading }: { a: Analysis | undefined; workerOnline: boolean; loading: boolean }) {
  if (loading || !a) return <p className="mt-1 text-[13px] text-ink-faint">Loading…</p>;
  const offline = !workerOnline && (a.status === "queued" || a.status === "running");
  return (
    <p className="mt-1 text-[13px] leading-relaxed text-ink-muted" aria-live="polite">
      {a.status === "none" && "Find clip-worthy moments from what’s actually in this recording."}
      {(a.status === "queued" || a.status === "running") && (
        <span className="inline-flex items-center gap-2 text-accent-ink">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {offline ? "Waiting for the background worker (npm run worker)…" : a.status === "queued" ? "Waiting to start…" : `${STAGE[a.stage ?? ""] ?? "Analyzing"}…`}
        </span>
      )}
      {a.status === "failed" && <span className="text-danger">{a.error ?? "Analysis failed."}</span>}
      {a.status === "done" && (
        <>
          {a.counts.peaks + a.counts.jumps} loudness events · {a.counts.scenes} picture changes · {a.counts.keyframes} keyframes
        </>
      )}
    </p>
  );
}

function SignalChips({ a }: { a: Analysis }) {
  const s = a.signals!;
  const items = [
    { key: "audio", icon: AudioLines, label: "Audio loudness", sig: s.audio },
    { key: "scenes", icon: ScanLine, label: "Picture changes", sig: s.scenes },
    { key: "speech", icon: Mic, label: "Speech", sig: s.speech },
    { key: "vision", icon: Film, label: "Scene descriptions", sig: s.vision },
  ];
  return (
    <ul aria-label="Signals used" className="flex flex-wrap gap-2 px-5 py-3">
      {items.map(({ key, icon: Icon, label, sig }) => (
        <li
          key={key}
          title={sig.note ?? undefined}
          className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium", sig.ok ? "border-ok/30 bg-ok/10 text-ok" : "border-line text-ink-faint")}
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
          <span className="sr-only">: </span>
          {sig.ok ? <Check className="size-3" aria-label="used" /> : <span>· {key === "audio" ? "no audio track" : key === "speech" ? speechChip(sig.note) : "not set up"}</span>}
        </li>
      ))}
    </ul>
  );
}

const speechChip = (note: string | null) =>
  note === "Not transcribed yet" ? "not transcribed yet" : note === "No speech detected" ? "no speech detected" : note === "No audio track" ? "no audio track" : "not set up";

const MARK: Record<Analysis["markers"][number]["kind"], string> = {
  loudness_peak: "bg-accent",
  loudness_jump: "bg-warn",
  scene_change: "bg-ink-faint/60",
  silence: "",
};

function Timeline({
  analysis,
  suggestions,
  durationMs,
  nowMs,
  selected,
  onSeek,
  onSelect,
}: {
  analysis: Analysis;
  suggestions: Suggestion[];
  durationMs: number;
  nowMs: number;
  selected: string | null;
  onSeek: (ms: number) => void;
  onSelect: (s: Suggestion) => void;
}) {
  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / durationMs) * 100))}%`;
  return (
    <div className="mt-4">
      <div
        className="relative h-16 cursor-pointer overflow-hidden rounded-xl border border-line bg-surface-2/70"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * durationMs);
        }}
        aria-hidden
      >
        {analysis.markers
          .filter((m) => m.kind === "silence")
          .map((m, i) => (
            <span key={`s${i}`} className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,transparent_0_4px,var(--line)_4px_5px)]" style={{ left: pct(m.startMs), width: pct(m.endMs - m.startMs) }} />
          ))}
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(s);
            }}
            className={cn(
              "absolute inset-y-2 rounded-lg border transition-colors",
              s.saveStatus === "saved" ? "border-ok/50 bg-ok/15" : selected === s.id ? "border-accent bg-accent/25" : "border-accent/40 bg-accent/10 hover:bg-accent/20",
            )}
            style={{ left: pct(s.startMs), width: pct(s.endMs - s.startMs) }}
          />
        ))}
        {analysis.markers
          .filter((m) => m.kind !== "silence")
          .map((m, i) => (
            <span
              key={`m${i}`}
              className={cn("pointer-events-none absolute bottom-0 w-[2px] -translate-x-1/2 rounded-full", MARK[m.kind], m.kind === "scene_change" ? "h-3" : "h-7")}
              style={{ left: pct(m.kind === "scene_change" ? m.startMs : (m.startMs + m.endMs) / 2) }}
            />
          ))}
        <span className="pointer-events-none absolute inset-y-0 w-px bg-white/80" style={{ left: pct(nowMs) }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-faint">
        <span className="flex items-center gap-1.5"><span className="h-3 w-[2px] rounded-full bg-accent" aria-hidden /> Loud</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-[2px] rounded-full bg-warn" aria-hidden /> Sudden</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-[2px] rounded-full bg-ink-faint/60" aria-hidden /> Picture change</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-accent/40 bg-accent/10" aria-hidden /> Suggested clip</span>
        <span className="ml-auto font-mono tabular-nums">{timecode(nowMs)} / {timecode(durationMs)}</span>
      </div>
    </div>
  );
}

function SuggestionCard({
  s,
  rank,
  durationMs,
  nowMs,
  selected,
  previewing,
  busy,
  onSelect,
  onPreview,
  onAct,
  onSeek,
}: {
  s: Suggestion;
  rank: number;
  durationMs: number;
  nowMs: number;
  selected: boolean;
  previewing: boolean;
  busy: string | null;
  onSelect: () => void;
  onPreview: () => void;
  onAct: (body: Parameters<ReturnType<typeof useSmartClip>["act"]>[1], key: string) => void;
  onSeek: (ms: number) => void;
}) {
  const [why, setWhy] = useState(false);
  const conf = CONFIDENCE[s.confidence];
  const locked = s.saveStatus === "saving" || s.saveStatus === "saved";
  const adjusted = s.startMs !== s.suggestedStartMs || s.endMs !== s.suggestedEndMs;
  const isBusy = (k: string) => busy === `${k}:${s.id}`;
  const nudge = (which: "start" | "end", delta: number | "now") => {
    const start = which === "start" ? (delta === "now" ? Math.round(nowMs) : s.startMs + delta) : s.startMs;
    const end = which === "end" ? (delta === "now" ? Math.round(nowMs) : s.endMs + delta) : s.endMs;
    onAct({ action: "adjust", startMs: Math.max(0, start), endMs: Math.min(durationMs, end) }, "adjust");
    onSeek(which === "start" ? Math.max(0, start) : Math.max(0, Math.min(durationMs, end) - 2000));
  };

  return (
    <li className={cn("grid gap-4 p-5 transition-colors sm:grid-cols-[9.5rem_minmax(0,1fr)]", selected && "bg-accent/[0.05]")} onFocusCapture={onSelect} onClick={onSelect}>
      <button type="button" onClick={onPreview} className="group relative aspect-video overflow-hidden rounded-xl bg-surface-3 ring-1 ring-line" aria-label={previewing ? `Stop preview of ${s.title}` : `Preview ${s.title}, ${timecode(s.startMs)} to ${timecode(s.endMs)}`}>
        {s.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local keyframe
          <img src={s.thumbUrl} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-90 transition-opacity group-hover:opacity-100">
          <span className="grid size-9 place-items-center rounded-full bg-white/90 text-black">
            {previewing ? <Square className="size-3.5 fill-current" aria-hidden /> : <Play className="ml-0.5 size-4 fill-current" aria-hidden />}
          </span>
        </span>
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10.5px] text-white">{len(s)}</span>
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11.5px] text-ink-faint">#{rank}</span>
          <h3 className="text-[15px] font-medium text-ink">{s.title}</h3>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", conf.cls)}>{conf.label}</span>
        </div>
        <p className="mt-1 font-mono text-[12px] tabular-nums text-ink-muted">
          {timecode(s.startMs)} – {timecode(s.endMs)} · {len(s)}
          {adjusted && <span className="ml-2 font-sans text-ink-faint">(adjusted)</span>}
        </p>
        <ul className="mt-3 space-y-1">
          {s.evidence.map((e, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-muted">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>
                <span className="font-medium text-ink">{e.label}</span> at {timecode(e.startMs)} — {e.detail}
              </span>
            </li>
          ))}
        </ul>
        {s.speech.length > 0 && (
          <div className="mt-3">
            <p className="text-[11.5px] font-medium uppercase tracking-[0.14em] text-ink-faint">Said in this clip</p>
            <ul className="mt-1 space-y-1">
              {s.speech.map((g, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-ink-muted">
                  <Mic className="mt-[3px] size-3.5 shrink-0 text-ink-faint" aria-hidden />
                  <button type="button" onClick={() => onSeek(g.startMs)} className="rounded text-left hover:text-ink">
                    <span className="font-mono text-[11.5px] text-ink-faint">{timecode(g.startMs)}</span> “{g.text}”
                    {g.nearEvent && <span className="ml-1.5 text-[11.5px] text-ink-faint">· near the signal</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-faint">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {s.uncertainty}
        </p>
        <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} className="mt-2 flex items-center gap-1 rounded-md text-[12px] font-medium text-ink-muted hover:text-ink">
          <ChevronDown className={cn("size-3.5 transition-transform", why && "rotate-180")} aria-hidden /> Why this rank · score {s.score.toFixed(2)}
        </button>
        {why && (
          <ul className="mt-1.5 space-y-0.5 rounded-lg border border-line bg-surface/50 px-3 py-2 text-[12px] text-ink-muted">
            {s.breakdown.map((b) => (
              <li key={b.rule} className="flex justify-between gap-4">
                <span>{b.rule}</span>
                <span className="font-mono tabular-nums text-ink-faint">+{b.points.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}

        {selected && !locked && (
          <div className="mt-4 grid gap-2 rounded-xl border border-line bg-surface/50 p-3 text-[12px] sm:grid-cols-2" aria-label="Adjust clip boundaries">
            {(["start", "end"] as const).map((w) => (
              <div key={w} className="flex flex-wrap items-center gap-1.5">
                <span className="w-9 text-ink-faint">{w === "start" ? "Start" : "End"}</span>
                <Button size="sm" variant="ghost" onClick={() => nudge(w, -1000)} disabled={busy !== null} aria-label={`Move ${w} 1 second earlier`}>−1s</Button>
                <span className="font-mono tabular-nums text-ink">{timecode(w === "start" ? s.startMs : s.endMs)}</span>
                <Button size="sm" variant="ghost" onClick={() => nudge(w, 1000)} disabled={busy !== null} aria-label={`Move ${w} 1 second later`}>+1s</Button>
                <Button size="sm" variant="ghost" onClick={() => nudge(w, "now")} disabled={busy !== null}>Set to {timecode(nowMs)}</Button>
              </div>
            ))}
            {adjusted && (
              <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => onAct({ action: "adjust", startMs: s.suggestedStartMs, endMs: s.suggestedEndMs }, "adjust")} disabled={busy !== null}>
                <Undo2 className="size-3.5" aria-hidden /> Reset to suggested
              </Button>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2" aria-live="polite">
          <Button size="sm" variant="secondary" onClick={onPreview}>
            {previewing ? <Square className="size-3 fill-current" aria-hidden /> : <Play className="size-3.5" aria-hidden />} {previewing ? "Stop" : "Preview"}
          </Button>
          {s.saveStatus === null && (
            <>
              <Button size="sm" onClick={() => onAct({ action: "accept" }, "accept")} disabled={busy !== null}>
                {isBusy("accept") ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Check className="size-3.5" aria-hidden />} Save clip
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onAct({ action: "dismiss" }, "dismiss")} disabled={busy !== null}>
                <X className="size-3.5" aria-hidden /> Dismiss
              </Button>
            </>
          )}
          {s.saveStatus === "saving" && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-accent-ink">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Cutting the clip from the original…
            </span>
          )}
          {s.saveStatus === "saved" && (
            <span className="inline-flex flex-wrap items-center gap-2 text-[12.5px]">
              {s.savedReady ? (
                <span className="inline-flex items-center gap-1.5 text-ok"><Check className="size-3.5" aria-hidden /> Saved to your Library</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-accent-ink"><LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Saved — finishing up…</span>
              )}
              {s.savedRecordingId && (
                <Link href={`/recordings/${s.savedRecordingId}`} className="font-medium text-accent-ink hover:text-white">
                  Open clip →
                </Link>
              )}
            </span>
          )}
          {s.saveStatus === "failed" && (
            <>
              <span className="text-[12.5px] text-danger">{s.saveError ?? "Saving failed."}</span>
              <Button size="sm" variant="secondary" onClick={() => onAct({ action: "retry" }, "retry")} disabled={busy !== null}>
                <RotateCcw className="size-3.5" aria-hidden /> Retry
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
