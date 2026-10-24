"use client";

import { ArrowRight, Circle, History, LoaderCircle, MonitorOff, PlugZap, Radio, Settings2, Square, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { replayLabel } from "@/lib/capture/settings";
import { CONNECTION_LABEL, type CaptureView } from "@/lib/capture/status";
import type { LibraryRecording } from "@/lib/recordings/types";
import { cn } from "@/lib/cn";
import { Button, ButtonLink } from "@/components/ui/button";
import { CaptureDot } from "./capture-status";
import { captureCommand, useCapture } from "./use-capture";
import { useCaptureSettings } from "./use-capture-settings";

function clock(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(t / 3600), Math.floor((t % 3600) / 60), t % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Recording time, advanced locally between polls. */
function useRecordClock(state: CaptureView | undefined, fetchedAt: number | undefined) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!state?.recording) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [state?.recording]);
  if (!state?.recording || !fetchedAt) return null;
  return state.recordDurationMs + Math.max(0, (now || fetchedAt) - fetchedAt);
}

type Busy = null | "record" | "replay" | "save";

/**
 * Recording dashboard driven by OBS's real state. Controls are enabled only
 * when OBS can perform them, and outcomes are reported only once OBS confirms.
 */
export function CaptureConsole() {
  const settings = useCaptureSettings();
  const snap = useCapture();
  const s = snap?.state;
  const connected = s?.connection === "connected";
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const elapsed = useRecordClock(s, snap?.fetchedAt);

  const replaySeconds = s?.replaySeconds ?? settings.replaySeconds;
  const replay = replayLabel(replaySeconds);

  async function run(kind: Exclude<Busy, null>, action: string, payload?: Record<string, unknown>) {
    setBusy(kind);
    setError(null);
    const res = await captureCommand(action, payload);
    if (!res.ok) setError(res.error);
    setBusy(null);
  }

  const unavailable = !s
    ? "Checking the capture engine…"
    : s.connection === "worker-offline"
      ? "The background worker isn’t running, so METAL can’t reach OBS. Start it with npm run worker (or npm run dev:all)."
      : s.connection === "not-configured"
        ? "Connect OBS in Sources to record and save clips. Nothing is being recorded right now."
        : s.connection === "connecting"
          ? "Connecting to OBS…"
          : s.connection === "error"
            ? (s.error ?? "METAL can’t reach OBS.")
            : null;

  return (
    <section aria-labelledby="capture-heading" className="overflow-hidden rounded-3xl border border-line bg-surface-2/60">
      <h2 id="capture-heading" className="sr-only">Capture</h2>

      {/* Monitor */}
      <div className="relative isolate flex min-h-[360px] flex-col overflow-hidden sm:aspect-video sm:min-h-0 xl:aspect-[2/1]">
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 -z-10 transition-opacity duration-700",
            s?.recording ? "bg-[radial-gradient(ellipse_at_50%_120%,rgb(248_113_113/0.18),transparent_60%)]" : "bg-[radial-gradient(ellipse_at_50%_120%,rgb(139_92_255/0.16),transparent_60%)]",
          )}
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />
        <div aria-hidden className="grain absolute inset-0 -z-10" />

        <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
          <span className="glass flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink-muted" role="status">
            <CaptureDot connection={s?.connection ?? null} />
            OBS · {s ? CONNECTION_LABEL[s.connection] : "Checking…"}
            {s?.obsVersion && <span className="text-ink-faint">{s.obsVersion}</span>}
          </span>
          <span className={cn("flex items-center gap-2 font-mono text-[12px] tabular-nums", s?.recording ? "text-danger" : "text-ink-faint")}>
            <span className={cn("flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] tracking-[0.18em]", s?.recording ? "border-danger/50 bg-danger/10" : "border-line")}>
              <Circle className={cn("size-2 fill-current", s?.recording && "animate-pulse")} aria-hidden /> REC
            </span>
            <span aria-label={s?.recording ? `Recording for ${clock(elapsed ?? 0)}` : "Not recording"}>{s?.recording ? clock(elapsed ?? 0) : "--:--:--"}</span>
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center sm:pb-14">
          {connected ? <LiveStage s={s} replay={replay} /> : <OfflineStage s={s} />}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4 border-t border-line p-4 sm:p-5 2xl:flex-row 2xl:items-center">
        <div className="flex flex-wrap gap-3">
          {s?.recording ? (
            <Button onClick={() => run("record", "stop-record")} disabled={!connected || busy !== null} className="bg-danger text-white shadow-none hover:bg-danger/90">
              {busy === "record" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Square className="size-3.5 fill-current" aria-hidden />}
              Stop recording
            </Button>
          ) : (
            <Button
              onClick={() => run("record", "start-record")}
              disabled={!connected || busy !== null}
              aria-describedby={unavailable ? "capture-unavailable" : undefined}
              className="bg-danger/90 text-white shadow-none hover:bg-danger"
            >
              {busy === "record" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Circle className="size-3.5 fill-current" aria-hidden />}
              Start recording
            </Button>
          )}
          <Button
            variant={s?.replayActive ? "primary" : "secondary"}
            onClick={() => run("save", "save-replay")}
            disabled={!connected || !s?.replayActive || busy !== null}
            aria-describedby={!s?.replayActive ? "replay-hint" : undefined}
          >
            {busy === "save" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <History className="size-4" aria-hidden />}
            {busy === "save" ? "Saving…" : `Save last ${replay}`}
          </Button>
          <Button
            variant="ghost"
            onClick={() => run("replay", s?.replayActive ? "stop-replay" : "start-replay", s?.replayActive ? undefined : { replaySeconds: settings.replaySeconds })}
            disabled={!connected || !s?.replayAvailable || busy !== null}
            aria-pressed={Boolean(s?.replayActive)}
          >
            {busy === "replay" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Radio className="size-4" aria-hidden />}
            {s?.replayActive ? "Stop replay buffer" : "Start replay buffer"}
          </Button>
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-faint 2xl:ml-auto">
          <div className="flex items-center gap-2">
            <dt>Replay buffer</dt>
            <dd className="text-ink-muted">
              {replay} · {s?.replayActive ? "On" : "Off"}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>In-game</dt>
            <dd className="text-ink-muted">OBS “Save Replay” hotkey</dd>
          </div>
          <Link href="/settings" className="flex items-center gap-1.5 rounded-md text-ink-muted transition-colors hover:text-ink">
            <Settings2 className="size-4" aria-hidden /> Capture settings
          </Link>
        </dl>
      </div>

      <div className="space-y-2 border-t border-line bg-surface/40 px-4 py-3 text-[12.5px] leading-relaxed sm:px-5" aria-live="polite">
        {unavailable && (
          <p id="capture-unavailable" className="text-ink-faint">
            {unavailable}
          </p>
        )}
        {connected && <ReplayHint s={s} wanted={settings.replaySeconds} />}
        {error && (
          <p role="alert" className="flex items-start gap-2 text-danger">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {error}
          </p>
        )}
        <ClipStatus s={s} rec={snap?.lastClipRecording ?? null} now={snap?.fetchedAt ?? 0} />
      </div>
    </section>
  );
}

function OfflineStage({ s }: { s: CaptureView | undefined }) {
  const Icon = s?.connection === "connecting" || !s ? LoaderCircle : s.connection === "error" ? PlugZap : MonitorOff;
  return (
    <>
      <span className="grid size-14 place-items-center rounded-2xl border border-line-strong bg-surface-3/80 text-ink-muted">
        <Icon className={cn("size-6", (s?.connection === "connecting" || !s) && "animate-spin")} strokeWidth={1.5} aria-hidden />
      </span>
      <p className="mt-5 text-[clamp(1.25rem,2.2vw,1.6rem)] font-semibold tracking-[-0.02em] text-ink">
        {!s ? "Checking OBS…" : s.connection === "connecting" ? "Connecting to OBS…" : s.connection === "error" ? "Can’t reach OBS" : s.connection === "worker-offline" ? "Worker isn’t running" : "No capture source connected"}
      </p>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink-muted">
        METAL records through OBS. Once it’s connected, you can record, keep a replay buffer, and save clips straight into your library.
      </p>
      <ButtonLink href="/sources" variant="secondary" size="sm" className="mt-6">
        {s?.configured ? "Check OBS connection" : "Set up OBS"}
      </ButtonLink>
    </>
  );
}

function LiveStage({ s, replay }: { s: CaptureView; replay: string }) {
  return (
    <>
      <span className={cn("grid size-14 place-items-center rounded-2xl border", s.recording ? "border-danger/40 bg-danger/10 text-danger" : "border-accent/40 bg-accent/10 text-accent-ink")}>
        {s.recording ? <Circle className="size-6 animate-pulse fill-current" aria-hidden /> : <Radio className="size-6" strokeWidth={1.5} aria-hidden />}
      </span>
      <p className="mt-5 text-[clamp(1.25rem,2.2vw,1.6rem)] font-semibold tracking-[-0.02em] text-ink">
        {s.recording ? "Recording in OBS" : s.replayActive ? `Buffering the last ${replay}` : "Ready to capture"}
      </p>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink-muted">
        {s.recording
          ? "When you stop, the full recording is imported into your library automatically."
          : s.replayActive
            ? "Something good happen? Save it — here or with OBS’s Save Replay hotkey — and it lands in your library."
            : s.replayAvailable
              ? "Start the replay buffer so you can save moments after they happen."
              : "Turn on the replay buffer in OBS → Settings → Output to save clips after the fact."}
      </p>
    </>
  );
}

function ReplayHint({ s, wanted }: { s: CaptureView; wanted: number }) {
  if (!s.replayAvailable) {
    return <p id="replay-hint" className="text-warn">OBS’s replay buffer is off. Enable it in OBS → Settings → Output → Replay Buffer, then reconnect.</p>;
  }
  if (s.replaySeconds !== null && s.replaySeconds !== wanted) {
    return (
      <p id="replay-hint" className="text-ink-faint">
        {s.replayActive
          ? `OBS is buffering ${replayLabel(s.replaySeconds)}. Stop and start the buffer to switch to ${replayLabel(wanted)} (OBS only changes it while stopped).`
          : `Starting the buffer here sets OBS to ${replayLabel(wanted)}.`}
      </p>
    );
  }
  if (!s.replayActive) return <p id="replay-hint" className="text-ink-faint">Start the replay buffer to save clips.</p>;
  return null;
}

function ClipStatus({ s, rec, now }: { s: CaptureView | undefined; rec: LibraryRecording | null; now: number }) {
  const clip = s?.lastClip;
  if (!clip || now - clip.at > 10 * 60_000) return null;
  const what = clip.kind === "replay" ? "Clip" : "Recording";
  const open = rec && (
    <Link href={`/recordings/${rec.id}`} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:text-white">
      Open <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
  if (clip.status === "saving") return <p className="text-accent-ink">Asking OBS to save the clip…</p>;
  if (clip.status === "importing") return <p className="text-accent-ink">{what} saved by OBS — waiting for the file and importing…</p>;
  if (clip.status === "failed") return <p className="text-danger">{what} couldn’t be imported: {clip.error}</p>;
  if (clip.status === "duplicate") return <p className="flex flex-wrap gap-2 text-ink-muted">{what} was already in your library. {open}</p>;
  if (!rec) return <p className="text-ink-muted">{what} imported.</p>;
  if (rec.status === "ready" || rec.status === "analyzed") return <p className="flex flex-wrap gap-2 text-ok">{what} saved and ready to watch. {open}</p>;
  if (rec.status === "failed") return <p className="text-danger">{what} couldn’t be processed: {rec.error}</p>;
  return <p className="flex flex-wrap gap-2 text-accent-ink">{what} imported — processing… {open}</p>;
}
