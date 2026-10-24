"use client";

import { Circle, History, MonitorOff, Settings2 } from "lucide-react";
import Link from "next/link";
import { replayLabel } from "@/lib/capture/settings";
import { CAPTURE_STATUS, CONNECTION_LABEL } from "@/lib/capture/status";
import { Button, ButtonLink } from "@/components/ui/button";
import { CaptureDot } from "./capture-status";
import { Hotkey } from "./kbd";
import { useCaptureSettings } from "./use-capture-settings";

/**
 * Recording dashboard. Every control reflects the real capture state; while
 * OBS isn't connected nothing here can start, save, or pretend to record.
 */
export function CaptureConsole() {
  const settings = useCaptureSettings();
  const status = CAPTURE_STATUS;
  const connected = status.connection === "connected";
  const replay = replayLabel(settings.replaySeconds);

  return (
    <section aria-labelledby="capture-heading" className="overflow-hidden rounded-3xl border border-line bg-surface-2/60">
      <h2 id="capture-heading" className="sr-only">Capture</h2>

      {/* Monitor */}
      <div className="relative isolate flex min-h-[360px] flex-col overflow-hidden sm:aspect-video sm:min-h-0 xl:aspect-[2/1]">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_120%,rgb(139_92_255/0.16),transparent_60%)]" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />
        <div aria-hidden className="grain absolute inset-0 -z-10" />

        <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
          <span className="glass flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 text-[12px] font-medium text-ink-muted" role="status">
            <CaptureDot />
            OBS · {CONNECTION_LABEL[status.connection]}
          </span>
          <span className="flex items-center gap-2 font-mono text-[12px] tabular-nums text-ink-faint" aria-label={status.recording ? "Recording" : "Not recording"}>
            <span aria-hidden className="flex items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] tracking-[0.18em]">
              <Circle className="size-2 fill-current" aria-hidden /> REC
            </span>
            <span aria-hidden>--:--:--</span>
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center sm:pb-14">
          <span className="grid size-14 place-items-center rounded-2xl border border-line-strong bg-surface-3/80 text-ink-muted">
            <MonitorOff className="size-6" strokeWidth={1.5} aria-hidden />
          </span>
          <p className="mt-5 text-[clamp(1.25rem,2.2vw,1.6rem)] font-semibold tracking-[-0.02em] text-ink">No capture source connected</p>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-ink-muted">
            METAL records through OBS. Once OBS is connected, this shows what’s being captured and how long you’ve been recording.
          </p>
          <ButtonLink href="/sources" variant="secondary" size="sm" className="mt-6">
            Set up OBS
          </ButtonLink>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4 border-t border-line p-4 sm:p-5 2xl:flex-row 2xl:items-center">
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={!connected}
            aria-describedby="capture-unavailable"
            className="bg-danger/90 text-white shadow-none hover:bg-danger"
          >
            <Circle className="size-3.5 fill-current" aria-hidden />
            Start recording
          </Button>
          <Button variant="secondary" disabled={!connected} aria-describedby="capture-unavailable">
            <History className="size-4" aria-hidden />
            Save last {replay}
          </Button>
        </div>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-ink-faint 2xl:ml-auto">
          <div className="flex items-center gap-2">
            <dt>Replay buffer</dt>
            <dd className="text-ink-muted">{replay} · {status.replayBufferActive ? "On" : "Off"}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>Save clip</dt>
            <dd><Hotkey accelerator={settings.hotkeys.saveClip} /></dd>
          </div>
          <Link href="/settings" className="flex items-center gap-1.5 rounded-md text-ink-muted transition-colors hover:text-ink">
            <Settings2 className="size-4" aria-hidden /> Capture settings
          </Link>
        </dl>
      </div>
      <p id="capture-unavailable" className="border-t border-line bg-surface/40 px-4 py-3 text-[12.5px] leading-relaxed text-ink-faint sm:px-5">
        Recording controls unlock when OBS is connected (Phase 3). Nothing is being recorded right now.
      </p>
    </section>
  );
}
