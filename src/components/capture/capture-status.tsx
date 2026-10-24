"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CONNECTION_LABEL, type CaptureConnection } from "@/lib/capture/status";
import { cn } from "@/lib/cn";
import { useCapture } from "./use-capture";

const DOT: Record<CaptureConnection, string> = {
  "not-configured": "bg-ink-faint",
  "worker-offline": "bg-warn",
  connecting: "bg-warn animate-pulse",
  connected: "bg-ok shadow-[0_0_10px_var(--ok)]",
  error: "bg-danger shadow-[0_0_10px_var(--danger)]",
};

/** Connection state, or "Checking…" before the first answer. */
function useStatus() {
  const snap = useCapture();
  const s = snap?.state;
  const lost = Boolean(snap?.lost);
  // A stale answer must not keep claiming "Connected" or "Recording".
  const recording = !lost && Boolean(s?.recording);
  return {
    connection: lost ? ("error" as const) : (s?.connection ?? null),
    lost,
    label: lost ? "No server reply" : !s ? "Checking…" : recording ? "Recording" : CONNECTION_LABEL[s.connection],
    recording,
    replay: !lost && Boolean(s?.replayActive),
  };
}

export function CaptureDot({ connection, recording, className }: { connection: CaptureConnection | null; recording?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        recording ? "animate-pulse bg-danger shadow-[0_0_10px_var(--danger)]" : connection ? DOT[connection] : "bg-ink-faint",
        className,
      )}
    />
  );
}

/** Sidebar footer card: live OBS state, links to Sources. */
export function SidebarCaptureStatus() {
  const { connection, label, recording, replay } = useStatus();
  return (
    <Link
      href="/sources"
      className="group mx-1 flex items-center gap-3 rounded-xl border border-line bg-surface-2/80 px-3 py-2.5 transition-colors hover:border-line-strong"
    >
      <CaptureDot connection={connection} recording={recording} />
      <span className="min-w-0 flex-1" aria-live="polite">
        <span className="block text-[12.5px] font-medium text-ink">OBS · {label}</span>
        <span className="block truncate text-[11.5px] text-ink-faint">
          {connection === "connected" ? (replay ? "Replay buffer on" : "Replay buffer off") : "Capture engine · Sources"}
        </span>
      </span>
      <ChevronRight className="size-4 text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/** Compact pill for the mobile header. */
export function CaptureStatusPill() {
  const { connection, label, recording } = useStatus();
  return (
    <Link
      href="/sources"
      aria-label={`Capture: OBS ${label}. Open Sources`}
      className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-[12.5px] font-medium text-ink-muted"
    >
      <CaptureDot connection={connection} recording={recording} />
      {label}
    </Link>
  );
}
