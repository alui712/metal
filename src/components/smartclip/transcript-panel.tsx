"use client";

import { Lock, LoaderCircle, Mic, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/format";
import type { Transcript } from "./use-smart-clip";

const STAGE: Record<string, string> = { audio: "Preparing audio", speech: "Transcribing speech", saving: "Saving transcript" };

/** Timestamped transcript from local whisper.cpp; click a line to play from there. */
export function TranscriptPanel({
  t,
  workerOnline,
  nowMs,
  busy,
  onTranscribe,
  onSeek,
}: {
  t: Transcript | undefined;
  workerOnline: boolean;
  nowMs: number;
  busy: string | null;
  onTranscribe: () => void;
  onSeek: (ms: number) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const active = t?.segments.findIndex((g) => nowMs >= g.startMs && nowMs < g.endMs + 300) ?? -1;
  useEffect(() => {
    if (active < 0 || !list.current) return;
    const el = list.current.children[active] as HTMLElement | undefined;
    const box = list.current;
    if (el && (el.offsetTop < box.scrollTop || el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight)) box.scrollTo({ top: el.offsetTop - 8 });
  }, [active]);
  if (!t) return null;
  const running = t.status === "queued" || t.status === "running";
  const canRun = t.setup.available && !running;

  return (
    <section id="transcript" aria-labelledby="transcript-heading" className="mt-6 scroll-mt-6 overflow-hidden rounded-3xl border border-line bg-surface-2/60">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
        <div className="min-w-0">
          <h2 id="transcript-heading" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Mic className="size-4 text-accent-ink" aria-hidden /> Transcript
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted" aria-live="polite">
            {t.status === "none" && (t.setup.available ? "Turn speech in this recording into timestamped text." : t.setup.reason)}
            {running && (
              <span className="inline-flex items-center gap-2 text-accent-ink">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                {!workerOnline ? "Waiting for the background worker (npm run worker)…" : t.status === "queued" ? "Waiting to start…" : `${STAGE[t.stage ?? ""] ?? "Transcribing"}…`}
              </span>
            )}
            {t.status === "failed" && <span className="text-danger">{t.error ?? "Transcription failed."}</span>}
            {t.status === "done" &&
              (t.segments.length
                ? `${t.segments.length} line${t.segments.length === 1 ? "" : "s"} · ${t.model ?? "whisper.cpp"}`
                : t.hasAudio === false
                  ? "This recording has no audio track, so there’s nothing to transcribe."
                  : "No speech detected. METAL doesn’t invent words for quiet or wordless audio.")}
          </p>
        </div>
        {(t.status === "none" || t.status === "failed") && (
          <Button onClick={onTranscribe} disabled={!canRun || busy !== null}>
            {busy === "transcribe" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Mic className="size-4" aria-hidden />}
            {t.status === "failed" ? "Try again" : "Transcribe speech"}
          </Button>
        )}
        {t.status === "done" && (
          <Button variant="ghost" size="sm" onClick={onTranscribe} disabled={!canRun || busy !== null}>
            <RotateCcw className="size-3.5" aria-hidden /> Re-transcribe
          </Button>
        )}
      </header>
      {t.status === "none" && t.setup.available && (
        <p className="flex items-start gap-2 px-5 py-4 text-[12.5px] leading-relaxed text-ink-faint">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Runs on this computer with whisper.cpp. Audio and text never leave your Mac, and no account or API key is used.
        </p>
      )}
      {t.status === "none" && !t.setup.available && (
        <p className="flex items-start gap-2 px-5 py-4 text-[12.5px] leading-relaxed text-ink-faint">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Set up: <code className="font-mono">brew install whisper-cpp</code>, then put <code className="font-mono">ggml-base.en.bin</code> in METAL’s <code className="font-mono">models/</code> folder.
        </p>
      )}
      {t.segments.length > 0 && (
        <>
          <ol ref={list} aria-label="Transcript lines" className="relative max-h-80 overflow-y-auto px-2 py-2">
            {t.segments.map((g, i) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onSeek(g.startMs)}
                  aria-current={i === active ? "true" : undefined}
                  className={cn("flex w-full gap-3 rounded-lg px-3 py-1.5 text-left text-[13.5px] leading-relaxed transition-colors hover:bg-surface-3/60", i === active ? "bg-accent/10 text-ink" : "text-ink-muted")}
                >
                  <span className="w-11 shrink-0 pt-px font-mono text-[11.5px] tabular-nums text-ink-faint">{timecode(g.startMs)}</span>
                  <span className="min-w-0">{g.text}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="border-t border-line px-5 py-2.5 text-[11.5px] text-ink-faint">Machine transcription — words may be wrong, and it doesn’t identify who is speaking.</p>
        </>
      )}
    </section>
  );
}
