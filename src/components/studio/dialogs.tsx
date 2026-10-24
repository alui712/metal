"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Download, FileVideo, Plus, X } from "lucide-react";
import type { Moment, StoryProject } from "@/lib/memory/contracts";
import { totalDuration } from "@/lib/studio/edl";
import { duration, seconds, timecode } from "@/lib/format";
import { ClipThumb } from "./clip-thumb";
import { KindTag } from "@/components/memory/kind";
import { Button } from "@/components/ui/button";
import { EASE_OUT } from "@/components/ui/motion";
import { ASPECT_SIZE, type StudioLibrary } from "./types";

function Modal({
  open,
  onOpenChange,
  title,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={`fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-line-strong bg-surface shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
                initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
                <div className="flex items-center justify-between border-b border-line px-6 py-4">
                  <Dialog.Title className="text-[17px] font-semibold text-ink">{title}</Dialog.Title>
                  <Dialog.Close className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-surface-3 hover:text-ink" aria-label="Close">
                    <X className="size-5" aria-hidden />
                  </Dialog.Close>
                </div>
                <div className="overflow-y-auto">{children}</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export function ExportDialog({
  open,
  onOpenChange,
  project,
  library,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  project: StoryProject;
  library: StudioLibrary;
}) {
  const size = ASPECT_SIZE[project.aspect];

  function downloadEdl() {
    const edl = {
      format: "metal-edl@1",
      title: project.title,
      aspect: project.aspect,
      output: { width: size.w, height: size.h, container: "mp4", video: "h264", audio: "aac" },
      captions: project.captions,
      source: library.source,
      clips: project.clips.map((c) => ({
        recordingId: c.recordingId,
        recordingTitle: library.recordings[c.recordingId]?.title,
        momentId: c.momentId,
        inMs: c.inMs,
        outMs: c.outMs,
        caption: project.captions ? c.caption : null,
      })),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(edl, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.trim().replace(/[^\w-]+/g, "-").toLowerCase() || "story"}.edl.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Export story">
      <div className="p-6">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-[13px]">
          {[
            ["Format", "MP4 · H.264 / AAC"],
            ["Frame", `${size.label} ${size.w}×${size.h}`],
            ["Length", `${duration(totalDuration(project))} (${seconds(totalDuration(project))})`],
            ["Clips", String(project.clips.length)],
            ["Captions", project.captions ? "Burned in" : "Off"],
            ["Source", library.source === "demo" ? "Demo fixtures" : "Your recordings"],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface-2 px-4 py-3">
              <dt className="text-ink-faint">{k}</dt>
              <dd className="mt-0.5 font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 rounded-2xl border border-warn/20 bg-warn/[0.06] p-4">
          <p className="flex items-center gap-2 text-[14px] font-medium text-warn">
            <FileVideo className="size-4" aria-hidden /> MP4 rendering isn’t available yet
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
            {library.source === "demo"
              ? "Exports are rendered locally with FFmpeg from your real recordings. That pipeline arrives in a later phase, and demo clips have no video to render — so METAL won’t pretend to export one."
              : "These clips are your real recordings, and the edit list below already has their exact ids and time ranges. Rendering them to one MP4 with FFmpeg arrives in Phase 7 — until then, preview plays the edit from the originals."}
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={downloadEdl} disabled={!project.clips.length}>
            <Download className="size-4" aria-hidden />
            Download edit list (.json)
          </Button>
          <Button disabled aria-describedby="render-note">
            Render MP4
          </Button>
        </div>
        <p id="render-note" className="mt-3 text-right text-[12px] text-ink-faint">
          Render becomes available when FFmpeg export is implemented.
        </p>
      </div>
    </Modal>
  );
}

export function AddMomentsDialog({
  open,
  onOpenChange,
  candidates,
  library,
  inProject,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidates: Moment[];
  library: StudioLibrary;
  inProject: Set<string>;
  onAdd: (m: Moment) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Add moments" wide>
      <ul className="divide-y divide-line">
        {candidates.map((m) => {
          const rec = library.recordings[m.recordingId];
          const added = inProject.has(m.id);
          return (
            <li key={m.id} className="flex items-center gap-4 px-6 py-3">
              <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
                <ClipThumb rec={rec} moment={m} atMs={m.startMs} />
              </span>
              <span className="min-w-0 flex-1">
                {library.source === "demo" && <KindTag kind={m.kind} />}
                <span className="block truncate text-[14px] font-medium text-ink">{m.title}</span>
                <span className="block truncate text-[12px] text-ink-faint">
                  {library.gameNames[rec.gameId] ? `${library.gameNames[rec.gameId]} · ` : ""}{rec.title} · {timecode(m.startMs)} · {seconds(m.endMs - m.startMs)}
                </span>
              </span>
              <Button variant={added ? "ghost" : "secondary"} size="sm" disabled={added} onClick={() => onAdd(m)}>
                {added ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                {added ? "Added" : "Add"}
              </Button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
