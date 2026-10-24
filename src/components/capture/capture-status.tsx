import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { CAPTURE_STATUS, CONNECTION_LABEL, type CaptureConnection } from "@/lib/capture/status";
import { cn } from "@/lib/cn";

const DOT: Record<CaptureConnection, string> = {
  "not-connected": "bg-ink-faint",
  connecting: "bg-warn animate-pulse",
  connected: "bg-ok shadow-[0_0_10px_var(--ok)]",
  error: "bg-danger shadow-[0_0_10px_var(--danger)]",
};

export function CaptureDot({ className }: { className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[CAPTURE_STATUS.connection], className)} />;
}

/** Sidebar footer card: capture engine state, links to Sources. */
export function SidebarCaptureStatus({ active }: { active?: boolean }) {
  return (
    <Link
      href="/sources"
      aria-current={active ? "page" : undefined}
      className="group mx-1 flex items-center gap-3 rounded-xl border border-line bg-surface-2/80 px-3 py-2.5 transition-colors hover:border-line-strong"
    >
      <CaptureDot />
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium text-ink">OBS · {CONNECTION_LABEL[CAPTURE_STATUS.connection]}</span>
        <span className="block text-[11.5px] text-ink-faint">Capture engine · set up in Sources</span>
      </span>
      <ChevronRight className="size-4 text-ink-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/** Compact pill for the mobile header. */
export function CaptureStatusPill() {
  return (
    <Link
      href="/sources"
      aria-label={`Capture: OBS ${CONNECTION_LABEL[CAPTURE_STATUS.connection]}. Open Sources`}
      className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-[12.5px] font-medium text-ink-muted"
    >
      <CaptureDot />
      {CONNECTION_LABEL[CAPTURE_STATUS.connection]}
    </Link>
  );
}
