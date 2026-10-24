"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, FileVideo, HardDrive, Info, LoaderCircle, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ACCEPTED_EXTENSIONS, MAX_FILES, extensionOf, fileKey, partitionFiles } from "@/lib/import/validate";
import { fileSize, plural, timecode } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/ui/button";
import { EASE_OUT } from "@/components/ui/motion";
import { PipelineSteps } from "./pipeline-steps";

type Preview =
  | { state: "reading" }
  | { state: "ready"; durationMs: number; width: number; height: number; poster: string | null }
  | { state: "unplayable" };

type Item = { id: string; file: File; preview: Preview };
type Rejection = { id: string; name: string; reason: string };

/** Reads duration, size, and a poster frame entirely in the browser. */
function readLocalPreview(file: File): Promise<Preview> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const done = (p: Preview) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(p);
    };
    const timer = setTimeout(() => done({ state: "unplayable" }), 8000);
    video.onerror = () => {
      clearTimeout(timer);
      done({ state: "unplayable" });
    };
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || !video.videoWidth) {
        clearTimeout(timer);
        done({ state: "unplayable" });
        return;
      }
      video.currentTime = Math.min(5, video.duration * 0.1);
    };
    video.onseeked = () => {
      clearTimeout(timer);
      let poster: string | null = null;
      try {
        const canvas = document.createElement("canvas");
        const scale = 320 / video.videoWidth;
        canvas.width = 320;
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        poster = canvas.toDataURL("image/jpeg", 0.75);
      } catch {
        poster = null;
      }
      done({
        state: "ready",
        durationMs: video.duration * 1000,
        width: video.videoWidth,
        height: video.videoHeight,
        poster,
      });
    };
    video.src = url;
  });
}

export function ImportExperience() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;
    const { accepted, rejected } = partitionFiles(files, new Set(items.map((i) => fileKey(i.file))));
    setRejections(rejected.map((r, n) => ({ id: `${Date.now()}-${n}`, name: r.file.name, reason: r.reason })));
    const added = accepted.map((file, n) => ({ id: `${fileKey(file)}-${Date.now()}-${n}`, file, preview: { state: "reading" } as Preview }));
    setItems((prev) => [...prev, ...added]);
    for (const item of added) {
      void readLocalPreview(item.file).then((preview) =>
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, preview } : i))),
      );
    }
  }

  // Let a file dropped anywhere on the page land here instead of opening it.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const totalBytes = items.reduce((s, i) => s + i.file.size, 0);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        {/* Dropzone */}
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current++;
            setDragging(true);
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (!dragDepth.current) setDragging(false);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "relative overflow-hidden rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-all duration-300 sm:py-20",
            dragging ? "scale-[1.01] border-accent bg-accent/[0.08]" : "border-line-strong bg-surface-2/50",
          )}
        >
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-1/2 top-0 h-48 w-[32rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/25 blur-3xl transition-opacity duration-500",
              dragging ? "opacity-100" : "opacity-30",
            )}
          />
          <motion.div
            animate={{ y: dragging ? -6 : 0 }}
            transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
            className="relative mx-auto grid size-16 place-items-center rounded-2xl border border-line-strong bg-surface-3"
          >
            <Upload className="size-7 text-accent-ink" strokeWidth={1.5} aria-hidden />
          </motion.div>
          <p className="relative mt-6 text-[20px] font-semibold tracking-[-0.01em] text-ink">
            {dragging ? "Drop to add" : "Drag recordings here"}
          </p>
          <p className="relative mt-2 text-[14px] text-ink-muted">
            {ACCEPTED_EXTENSIONS.map((e) => `.${e.toUpperCase()}`).join(" · ")} · up to 20 GB each
          </p>
          <Button onClick={() => inputRef.current?.click()} className="relative mt-7" variant="secondary">
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={["video/*", ...ACCEPTED_EXTENSIONS.map((e) => `.${e}`)].join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {/* Rejections */}
        <AnimatePresence>
          {rejections.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div role="alert" className="mt-5 rounded-2xl border border-danger/25 bg-danger/[0.06] p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-center gap-2 text-[14px] font-medium text-danger">
                    <CircleAlert className="size-4" aria-hidden />
                    {plural(rejections.length, "file")} couldn’t be added
                  </p>
                  <IconButton aria-label="Dismiss" onClick={() => setRejections([])} className="-m-2 size-8">
                    <X className="size-4" aria-hidden />
                  </IconButton>
                </div>
                <ul className="mt-2 space-y-1 text-[13px]">
                  {rejections.map((r) => (
                    <li key={r.id} className="flex gap-2">
                      <span className="truncate text-ink">{r.name}</span>
                      <span className="shrink-0 text-ink-muted">— {r.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Queue */}
        {items.length > 0 && (
          <section aria-labelledby="queue-heading" className="mt-10">
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 id="queue-heading" className="text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">
                Ready to import · {plural(items.length, "file")} · {fileSize(totalBytes)}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setItems([])}>
                Clear all
              </Button>
            </div>
            <ul className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                    className="rounded-2xl border border-line bg-surface-2/70 p-4"
                  >
                    <div className="flex gap-4">
                      <div className="relative grid aspect-video w-28 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-3 ring-1 ring-line sm:w-36">
                        {item.preview.state === "ready" && item.preview.poster ? (
                          // eslint-disable-next-line @next/next/no-img-element -- local data: URL frame
                          <img src={item.preview.poster} alt="" className="size-full object-cover" />
                        ) : item.preview.state === "reading" ? (
                          <LoaderCircle className="size-5 animate-spin text-ink-faint" aria-label="Reading file" />
                        ) : (
                          <FileVideo className="size-6 text-ink-faint" strokeWidth={1.5} aria-hidden />
                        )}
                        {item.preview.state === "ready" && (
                          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10.5px] text-white">
                            {timecode(item.preview.durationMs)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-[15px] font-medium text-ink" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <IconButton
                            aria-label={`Remove ${item.file.name}`}
                            onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                            className="-m-2 size-9"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </IconButton>
                        </div>
                        <p className="mt-0.5 text-[13px] text-ink-faint">
                          {extensionOf(item.file.name).toUpperCase()} · {fileSize(item.file.size)}
                          {item.preview.state === "ready" && ` · ${item.preview.width}×${item.preview.height}`}
                        </p>
                        <p className="mt-1 text-[12.5px]">
                          {item.preview.state === "reading" && <span className="text-ink-faint">Reading metadata locally…</span>}
                          {item.preview.state === "ready" && <span className="text-ok">Previewed locally</span>}
                          {item.preview.state === "unplayable" && (
                            <span className="text-warn">Your browser can’t preview this codec — it would be converted during import.</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <PipelineSteps
                      className="mt-4"
                      states={{ store: "unavailable", probe: "unavailable", proxy: "unavailable", transcribe: "unavailable", analyze: "unavailable", index: "unavailable" }}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-line bg-surface-2/50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p id="ingest-note" className="flex gap-2.5 text-[13px] leading-relaxed text-ink-muted">
                <Info className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
                Ingestion isn’t connected yet — nothing has been uploaded. These files were only read by your browser
                to preview them.
              </p>
              <Button disabled aria-describedby="ingest-note" className="shrink-0">
                Import {plural(items.length, "recording")}
              </Button>
            </div>
          </section>
        )}
      </div>

      {/* Guidance */}
      <aside aria-label="Import guidance" className="space-y-6 text-[13.5px] leading-relaxed text-ink-muted lg:pt-2">
        <div>
          <h2 className="text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">What works best</h2>
          <ul className="mt-3 space-y-2.5">
            <li><span className="text-ink">Full sessions, not just clips.</span> Longer recordings give Time Machine a whole night to work with.</li>
            <li><span className="text-ink">Voice chat on its own track</span> (OBS multi-track) makes transcripts far more accurate.</li>
            <li><span className="text-ink">MP4 (H.264)</span> previews instantly. MKV and HEVC are fine — they’re converted to a playable copy.</li>
          </ul>
        </div>
        <div className="border-t border-line pt-6">
          <h2 className="text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">Stays on your machine</h2>
          <p className="mt-3 flex gap-2.5">
            <HardDrive className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
            Originals are kept untouched in METAL’s local library folder. Nothing is sent anywhere to import a file.
          </p>
        </div>
        <p className="border-t border-line pt-6 text-[12.5px] text-ink-faint">
          Up to {MAX_FILES} files per import.
        </p>
      </aside>
    </div>
  );
}
