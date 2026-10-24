"use client";

import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, Download, Film, LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { fileSize, timecode } from "@/lib/format";
import type { StoryProject } from "@/lib/memory/contracts";
import { edlKey, totalDuration } from "@/lib/studio/edl";
import { Modal } from "./dialogs";
import { ASPECT_SIZE } from "./types";

// Client mirror of src/server/studio/stories.ts ExportView.
export type ExportView = {
  id: string;
  status: "queued" | "rendering" | "done" | "failed";
  stage: string | null;
  progress: number;
  error: string | null;
  edlKey: string;
  aspect: string;
  clipCount: number;
  durationMs: number | null;
  sizeBytes: number | null;
  createdAt: number;
  finishedAt: number | null;
  fileUrl: string | null;
};

const STAGE: Record<string, string> = { checking: "Checking your sources", rendering: "Rendering", verifying: "Verifying the video" };
const HEADERS = { "Content-Type": "application/json", "x-metal-action": "1" };

/** Polls this story's exports while one is in flight. */
export function useStoryExports(storyId: string, initial: ExportView[]) {
  const [exports, setExports] = useState(initial);
  const active = exports.some((e) => e.status === "queued" || e.status === "rendering");
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/stories/${storyId}/export`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setExports(((await res.json()) as { exports: ExportView[] }).exports);
  }, [storyId]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [active, refresh]);
  return { exports, refresh, active };
}

export function RealExportDialog({
  open,
  onOpenChange,
  project,
  storyId,
  exports,
  onRefresh,
  flush,
  issues,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: StoryProject;
  storyId: string;
  exports: ExportView[];
  onRefresh: () => Promise<void>;
  /** Saves pending edits; resolves to an error message or null. */
  flush: () => Promise<string | null>;
  issues: Record<string, string>;
}) {
  const reduce = useReducedMotion();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<HTMLVideoElement>(null);
  const latest = exports[0];
  const size = ASPECT_SIZE[project.aspect];
  const current = edlKey(project);
  const total = totalDuration(project);
  const issueCount = Object.keys(issues).length;
  const busy = latest?.status === "queued" || latest?.status === "rendering";

  async function render() {
    setStarting(true);
    setError(null);
    const saveErr = await flush();
    if (saveErr) {
      setError(saveErr);
      setStarting(false);
      return;
    }
    const res = await fetch(`/api/stories/${storyId}/export`, { method: "POST", headers: HEADERS }).catch(() => null);
    if (!res) setError("Couldn’t reach the METAL server.");
    else if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Export failed to start (${res.status}).`);
    await onRefresh();
    setStarting(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Export video" wide>
      <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_15rem]">
        {/* Result / state */}
        <div className="min-w-0">
          {latest?.status === "done" && latest.fileUrl ? (
            <div>
              <div className={cn("relative mx-auto overflow-hidden rounded-2xl bg-black ring-1 ring-line", latest.aspect === "9:16" ? "aspect-[9/16] max-h-[52vh]" : latest.aspect === "1:1" ? "aspect-square max-h-[52vh]" : "aspect-video")}>
                <video ref={player} key={latest.id} src={latest.fileUrl} controls playsInline preload="metadata" className="absolute inset-0 size-full" aria-label="Exported story video" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a href={`${latest.fileUrl}?download=1`} download className={buttonClass("primary", "md")}>
                  <Download className="size-4" aria-hidden /> Download MP4
                </a>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const v = player.current;
                    if (!v) return;
                    v.currentTime = 0;
                    void v.play().catch(() => {});
                  }}
                >
                  <RotateCcw className="size-4" aria-hidden /> Replay
                </Button>
                <span className="text-[12.5px] text-ink-faint">
                  {latest.durationMs !== null && timecode(latest.durationMs)} · {latest.sizeBytes !== null && fileSize(latest.sizeBytes)} · H.264/AAC
                </span>
              </div>
              {latest.edlKey !== current && (
                <p className="mt-3 rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-[12.5px] text-warn" role="status">
                  You’ve changed the story since this export. Render again to include your edits.
                </p>
              )}
            </div>
          ) : busy ? (
            <div className="grid aspect-video place-items-center rounded-2xl border border-line bg-[radial-gradient(80%_100%_at_50%_0%,rgb(139_92_246/0.18),transparent_70%)] bg-surface-2 p-6 text-center" role="status" aria-live="polite">
              <div className="w-full max-w-xs">
                <Film className="mx-auto size-8 text-accent-ink" strokeWidth={1.4} aria-hidden />
                <p className="mt-4 text-[16px] font-medium text-ink">{latest.status === "queued" ? "Waiting for the worker…" : `${STAGE[latest.stage ?? ""] ?? "Rendering"}…`}</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-4" role="progressbar" aria-label="Render progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(latest.progress * 100)}>
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-ink" animate={{ width: `${Math.max(3, latest.progress * 100)}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }} />
                </div>
                <p className="mt-2 font-mono text-[12px] text-ink-faint">{Math.round(latest.progress * 100)}%</p>
                {latest.status === "queued" && latest.error && <p className="mt-2 text-[12px] text-warn">{latest.error}</p>}
                <p className="mt-3 text-[12px] text-ink-faint">You can close this — rendering continues in the background.</p>
              </div>
            </div>
          ) : (
            <div className="grid aspect-video place-items-center rounded-2xl border border-dashed border-line-strong p-6 text-center">
              {latest?.status === "failed" ? (
                <div role="alert">
                  <AlertTriangle className="mx-auto size-7 text-danger" aria-hidden />
                  <p className="mt-3 text-[15px] font-medium text-ink">The export didn’t finish</p>
                  <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-muted">{latest.error}</p>
                </div>
              ) : (
                <div>
                  <Film className="mx-auto size-7 text-ink-faint" strokeWidth={1.4} aria-hidden />
                  <p className="mt-3 text-[14px] text-ink-muted">Render your story into one MP4 from the original recordings.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Settings */}
        <aside aria-label="Export settings" className="flex flex-col gap-4">
          <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line text-[13px]">
            {[
              ["Size", `${size.w}×${size.h} · ${size.label}`],
              ["Framing", project.framing === "fit" ? "Fit (bars)" : "Fill (crop)"],
              ["Frame rate", "30 fps"],
              ["Format", "MP4 · H.264 · AAC"],
              ["Length", `${timecode(total)} · ${project.clips.length} clip${project.clips.length === 1 ? "" : "s"}`],
              ["Captions", project.captions ? "Subtitle track" : "Off"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3.5 py-2">
                <dt className="text-ink-faint">{k}</dt>
                <dd className="text-right text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12px] leading-relaxed text-ink-faint">
            Hard cuts, rendered locally with FFmpeg. Clips without sound get silence. Captions are a subtitle track players can turn on — this FFmpeg build can’t burn text into the picture.
          </p>
          {issueCount > 0 && (
            <p className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
              {issueCount} clip{issueCount === 1 ? "’s source is" : "s’ sources are"} unavailable. Remove {issueCount === 1 ? "it" : "them"} to export.
            </p>
          )}
          {error && (
            <p role="alert" className="text-[12.5px] text-danger">
              {error}
            </p>
          )}
          <Button onClick={render} disabled={starting || busy || issueCount > 0 || project.clips.length === 0}>
            {starting || busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : latest?.status === "done" ? <RotateCcw className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
            {busy ? "Rendering…" : latest?.status === "failed" ? "Try again" : latest?.status === "done" ? "Render again" : "Render MP4"}
          </Button>
        </aside>
      </div>
    </Modal>
  );
}
