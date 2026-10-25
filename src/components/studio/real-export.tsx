"use client";

import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle, Check, Download, Film, LoaderCircle, RotateCcw, Trash2, X } from "lucide-react";
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

const HEADERS = { "Content-Type": "application/json", "x-metal-action": "1" };

/** Polls this story's exports while one is in flight. `preview` (judge mode): the given list is final. */
export function useStoryExports(storyId: string, initial: ExportView[], preview = false) {
  const [exports, setExports] = useState(initial);
  const active = !preview && exports.some((e) => e.status === "queued" || e.status === "rendering");
  const refresh = useCallback(async () => {
    if (preview) return;
    const res = await fetch(`/api/stories/${storyId}/export`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setExports(((await res.json()) as { exports: ExportView[] }).exports);
  }, [storyId, preview]);
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
  preview = false,
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
  /** Judge mode: show only the approved exports; no rendering or deleting. */
  preview?: boolean;
}) {
  const reduce = useReducedMotion();
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<HTMLVideoElement>(null);
  const latest = exports[0];
  const size = ASPECT_SIZE[project.aspect];
  const current = edlKey(project);
  const total = totalDuration(project);
  const issueCount = Object.keys(issues).length;
  const busy = latest?.status === "queued" || latest?.status === "rendering";
  // Reveal (and muted autoplay) only for an export that finished while this dialog was watching it.
  const [watched, setWatched] = useState<string | null>(null);
  if (busy && latest && watched !== latest.id) setWatched(latest.id);
  const justFinished = latest?.status === "done" && watched === latest.id;

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

  async function removeExport(id: string) {
    setDeleting(id);
    setError(null);
    setHistoryNotice(null);
    const res = await fetch(`/api/exports/${id}`, { method: "DELETE", headers: HEADERS, body: JSON.stringify({ projectId: storyId }) }).catch(() => null);
    if (!res?.ok) {
      const body = res ? ((await res.json().catch(() => ({}))) as { error?: string }) : {};
      setError(body.error ?? "Couldn’t delete the export.");
    } else {
      setConfirmDelete(null);
      setHistoryNotice("Export deleted.");
      await onRefresh();
    }
    setDeleting(null);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Export video" wide>
      <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_15rem]">
        {/* Result / state */}
        <div className="min-w-0">
          {latest?.status === "done" && latest.fileUrl ? (
            <motion.div key={latest.id} initial={justFinished && !reduce ? { opacity: 0, scale: 0.96, filter: "blur(6px)" } : false} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
              <p className="mb-3 flex items-center gap-2 text-[13px] font-medium text-ok" role="status">
                <Check className="size-4" aria-hidden /> Your story is ready{latest.finishedAt ? ` · rendered ${new Date(latest.finishedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
              </p>
              <div
                className={cn(
                  "relative mx-auto overflow-hidden rounded-2xl bg-black ring-1 ring-accent/30 shadow-[0_30px_90px_-30px_var(--violet-500)]",
                  latest.aspect === "9:16" ? "aspect-[9/16] max-h-[52vh]" : latest.aspect === "1:1" ? "aspect-square max-h-[52vh]" : "aspect-video",
                )}
              >
                <video ref={player} src={latest.fileUrl} controls playsInline preload="metadata" autoPlay={justFinished} muted={justFinished} className="absolute inset-0 size-full" aria-label="Exported story video" />
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
            </motion.div>
          ) : busy ? (
            <RenderingState e={latest} reduce={!!reduce} />
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
              ["Captions", project.captions ? "Burned in + track" : "Off"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-3.5 py-2">
                <dt className="text-ink-faint">{k}</dt>
                <dd className="text-right text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[12px] leading-relaxed text-ink-faint">
            Hard cuts, rendered locally with FFmpeg from your original recordings. Clips without sound get silence. Captions are drawn into the picture exactly as in the preview, and also included as a subtitle track.
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
          {preview ? (
            <p className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink-muted">
              Rendering is off in the prepared demo, so it never adds files or changes the story. Exports made beforehand appear below if they were approved.
            </p>
          ) : (
            <Button onClick={render} disabled={starting || busy || issueCount > 0 || project.clips.length === 0}>
              {starting || busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : latest?.status === "done" ? <RotateCcw className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
              {busy ? "Rendering…" : latest?.status === "failed" ? "Try again" : latest?.status === "done" ? "Render again" : "Render MP4"}
            </Button>
          )}
        </aside>
      </div>

      <section className="border-t border-line px-6 py-5" aria-labelledby="export-history-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="export-history-title" className="text-[15px] font-semibold text-ink">Export history</h3>
            <p className="mt-0.5 text-[12px] text-ink-faint">Previous renders stay available until you delete them.</p>
          </div>
          <span className="text-[12px] text-ink-faint">{exports.length} export{exports.length === 1 ? "" : "s"}</span>
        </div>
        {historyNotice && <p role="status" className="mt-3 text-[12.5px] text-ok">{historyNotice}</p>}
        {exports.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-5 text-center text-[13px] text-ink-muted">No exported videos yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line" aria-label="Previous exports">
            {exports.map((item) => {
              const output = ASPECT_SIZE[item.aspect as keyof typeof ASPECT_SIZE] ?? ASPECT_SIZE["16:9"];
              const active = item.status === "queued" || item.status === "rendering";
              const outdated = item.edlKey !== current;
              return (
                <li key={item.id} className="flex flex-col gap-3 bg-surface-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-[12px] font-medium", item.status === "done" ? "text-ok" : item.status === "failed" ? "text-danger" : "text-accent-ink")}>
                        {item.status === "done" ? "Ready" : item.status === "failed" ? "Failed" : item.status === "rendering" ? `Rendering ${Math.round(item.progress * 100)}%` : "Queued"}
                      </span>
                      {outdated && item.status === "done" && <span className="rounded-full border border-warn/25 bg-warn/10 px-2 py-0.5 text-[10px] font-medium text-warn">Story changed</span>}
                    </div>
                    <p className="mt-1 text-[12px] text-ink-muted">
                      {output.w}×{output.h}
                      {item.durationMs !== null ? ` · ${timecode(item.durationMs)}` : ""}
                      {item.sizeBytes !== null ? ` · ${fileSize(item.sizeBytes)}` : ""}
                      {` · ${new Date(item.finishedAt ?? item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                    </p>
                    {item.status === "failed" && item.error && <p className="mt-1 truncate text-[11.5px] text-danger">{item.error}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {item.status === "done" && item.fileUrl && (
                      <a href={`${item.fileUrl}?download=1`} download className={buttonClass("secondary", "sm")}>
                        <Download className="size-3.5" aria-hidden /> Download
                      </a>
                    )}
                    {confirmDelete === item.id ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}><X className="size-3.5" aria-hidden /> Cancel</Button>
                        <Button size="sm" variant="secondary" className="border-danger/30 text-danger hover:bg-danger/10" disabled={deleting === item.id} onClick={() => void removeExport(item.id)}>
                          {deleting === item.id ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />} Confirm delete
                        </Button>
                      </>
                    ) : preview ? null : (
                      <Button size="sm" variant="ghost" disabled={active || deleting !== null} aria-label={`Delete export from ${new Date(item.createdAt).toLocaleDateString()}`} title={active ? "Wait for rendering to finish" : undefined} onClick={() => setConfirmDelete(item.id)}>
                        <Trash2 className="size-3.5" aria-hidden /> Delete
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Modal>
  );
}

const STEPS = [
  { key: "queued", label: "Queued" },
  { key: "checking", label: "Checking sources" },
  { key: "rendering", label: "Rendering" },
  { key: "verifying", label: "Verifying" },
] as const;

function RenderingState({ e, reduce }: { e: ExportView; reduce: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const step = e.status === "queued" ? 0 : Math.max(1, STEPS.findIndex((x) => x.key === e.stage));
  const pct = Math.round(e.progress * 100);
  const elapsed = Math.max(0, Math.round((now - e.createdAt) / 1000));
  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl border border-line bg-surface-2 p-6 text-center" role="status" aria-live="polite">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(139_92_246/0.28),transparent_70%)]"
        animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative w-full max-w-sm">
        <p className="font-display text-[44px] leading-none tabular-nums text-ink">
          {pct}
          <span className="text-[22px] text-ink-faint">%</span>
        </p>
        <p className="mt-2 text-[14px] font-medium text-ink">{e.status === "queued" ? "Waiting for the worker…" : `${STEPS[step].label}…`}</p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-4" role="progressbar" aria-label="Render progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <motion.div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-ink" animate={{ width: `${Math.max(3, pct)}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }} />
        </div>
        <ol className="mt-4 flex justify-between gap-2 text-[11px]" aria-label="Steps">
          {STEPS.map((x, i) => (
            <li key={x.key} className={cn("flex items-center gap-1.5", i < step ? "text-ok" : i === step ? "text-ink" : "text-ink-faint")} aria-current={i === step ? "step" : undefined}>
              <span className={cn("grid size-4 place-items-center rounded-full border text-[9px]", i < step ? "border-ok/40 bg-ok/15" : i === step ? "border-accent bg-accent/20" : "border-line")}>
                {i < step ? <Check className="size-2.5" aria-hidden /> : i + 1}
              </span>
              <span className="hidden sm:inline">{x.label}</span>
            </li>
          ))}
        </ol>
        {e.status === "queued" && e.error && <p className="mt-3 text-[12px] text-warn">{e.error}</p>}
        <p className="mt-4 text-[12px] text-ink-faint">
          {elapsed}s elapsed · you can close this — rendering continues in the background.
        </p>
      </div>
    </div>
  );
}
