"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CloudOff,
  LoaderCircle,
  ArrowRight,
  Captions,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Download,
  Redo2,
  RectangleHorizontal,
  RectangleVertical,
  Sparkles,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Aspect, Moment, StoryProject } from "@/lib/memory/contracts";
import { clipDuration, historyReducer, initHistory, type EdlOp } from "@/lib/studio/edl";
import { clipFromMoment, trimBounds } from "@/lib/studio/seed";
import { seconds, timecode } from "@/lib/format";
import { Button, IconButton } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/controls";
import { DemoBadge } from "@/components/ui/demo-badge";
import { StepStrip } from "@/components/ui/how-it-works";
import { ClipThumb } from "./clip-thumb";
import { ClipTimeline } from "./clip-timeline";
import { AddMomentsDialog, ExportDialog } from "./dialogs";
import { RealExportDialog, useStoryExports, type ExportView } from "./real-export";
import { SequencePreview } from "./sequence-preview";
import type { StudioLibrary } from "./types";


const INSTRUCTION_IDEAS = ["Make it 30 seconds", "Start with the funniest moment", "Vertical for sharing"];

export function StudioEditor({
  initial,
  library,
  candidates,
  sourceSession,
  persist,
}: {
  initial: StoryProject;
  library: StudioLibrary;
  candidates: Moment[];
  /** Where the story came from (link back). */
  sourceSession?: { href: string; title: string };
  /** Real stories: autosave + render through the worker. */
  /** `preview` (judge mode): edits stay in this tab; nothing is saved, rendered or deleted. */
  persist?: { storyId: string; exports: ExportView[]; removedCount: number; preview?: boolean };
}) {
  const lookup = useMemo(
    () => ({ recording: (id: string) => library.recordings[id], moment: (id: string) => library.moments[id] }),
    [library],
  );
  const [history, dispatch] = useReducer(historyReducer, initial, initHistory);
  const project = history.present;
  const [selectedId, setSelectedId] = useState<string | null>(project.clips[0]?.id ?? null);
  const [seekTo, setSeekTo] = useState<{ ms: number; nonce: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const lastCoalesce = useRef<{ key: string; at: number } | null>(null);

  const preview = Boolean(persist?.preview);
  const { save, flush } = useAutosave(preview ? null : (persist?.storyId ?? null), project);
  const story = useStoryExports(persist?.storyId ?? "", persist?.exports ?? [], preview);
  const latestExport = story.exports[0];
  const issues = library.issues ?? {};
  const issueCount = project.clips.filter((c) => issues[c.id]).length;

  const bounds = useMemo(() => trimBounds(lookup, [...project.clips, ...candidates.map(clipFromMoment)]), [lookup, project.clips, candidates]);
  const selected = project.clips.find((c) => c.id === selectedId) ?? null;
  const selectedIndex = selected ? project.clips.indexOf(selected) : -1;

  /** Apply an edit. Rapid edits with the same `coalesceKey` merge into one undo step. */
  function apply(op: EdlOp, coalesceKey?: string) {
    const now = Date.now();
    const coalesce =
      !!coalesceKey && lastCoalesce.current?.key === coalesceKey && now - lastCoalesce.current.at < 1200;
    lastCoalesce.current = coalesceKey ? { key: coalesceKey, at: now } : null;
    dispatch({ type: "apply", op, bounds, coalesce });
  }

  function selectClip(id: string) {
    setSelectedId(id);
    let start = 0;
    for (const c of project.clips) {
      if (c.id === id) break;
      start += clipDuration(c);
    }
    setSeekTo({ ms: start, nonce: Date.now() });
  }

  function remove(id: string) {
    const i = project.clips.findIndex((c) => c.id === id);
    const neighbor = project.clips[i + 1] ?? project.clips[i - 1];
    apply({ type: "remove", clipId: id });
    setSelectedId(neighbor?.id ?? null);
  }

  // ⌘Z / ⇧⌘Z (not while typing).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea")) return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const inProject = new Set(project.clips.map((c) => c.momentId).filter(Boolean) as string[]);
  const selRec = selected ? library.recordings[selected.recordingId] : undefined;
  const selMoment = selected?.momentId ? library.moments[selected.momentId] : undefined;
  const selBounds = selected ? bounds[selected.id] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {sourceSession ? (
            <Link
              href={sourceSession.href}
              transitionTypes={["nav-back"]}
              className="inline-flex items-center gap-1.5 text-[13px] text-ink-faint transition-colors hover:text-ink"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> From “{sourceSession.title}”
            </Link>
          ) : (
            <p className="text-[13px] text-ink-faint">{persist ? "Your story" : "Starting from your top moments"}</p>
          )}
          <div className="mt-1 flex items-center gap-3">
            <label htmlFor="story-title" className="sr-only">Story title</label>
            <input
              id="story-title"
              value={project.title}
              maxLength={80}
              onChange={(e) => apply({ type: "setTitle", title: e.target.value }, "title")}
              className="w-full min-w-0 rounded-lg bg-transparent text-[clamp(1.5rem,3vw,2.25rem)] font-semibold tracking-[-0.03em] text-ink outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:-ml-2 sm:px-2"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {library.source === "demo" ? (
            <DemoBadge className="mr-2" />
          ) : (
            <span className="mr-2 inline-flex h-6 items-center rounded-full border border-ok/25 bg-ok/10 px-2.5 text-[11px] font-medium text-ok">Your recordings</span>
          )}
          {persist && (
            <span className="mr-1 inline-flex items-center gap-1.5 text-[12px] text-ink-faint" role="status" aria-live="polite" data-save={save}>
              {save === "saving" ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Saving…
                </>
              ) : preview ? (
                <span title="The prepared demo never changes the story. Reload to start over.">Preview · not saved</span>
              ) : save === "error" ? (
                <span className="flex items-center gap-1.5 text-danger">
                  <CloudOff className="size-3.5" aria-hidden /> Not saved
                </span>
              ) : (
                "Saved"
              )}
            </span>
          )}
          <IconButton aria-label="Undo (⌘Z)" title="Undo (⌘Z)" onClick={() => dispatch({ type: "undo" })} disabled={!history.past.length} className="border border-line">
            <Undo2 className="size-[18px]" aria-hidden />
          </IconButton>
          <IconButton aria-label="Redo (⇧⌘Z)" title="Redo (⇧⌘Z)" onClick={() => dispatch({ type: "redo" })} disabled={!history.future.length} className="border border-line">
            <Redo2 className="size-[18px]" aria-hidden />
          </IconButton>
          {preview ? (
            // The prepared demo never renders, so this opens the approved export history only.
            <Button variant="secondary" onClick={() => setExportOpen(true)} className="ml-1" title="Rendering is off in the prepared demo">
              <Download className="size-4" aria-hidden /> <span className="hidden sm:inline">View exports</span>
              <span className="sm:hidden">Exports</span>
            </Button>
          ) : (
            <Button onClick={() => setExportOpen(true)} className="ml-1">
              {story.active ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
              {story.active ? `Rendering ${Math.round((latestExport?.progress ?? 0) * 100)}%` : "Export"}
            </Button>
          )}
        </div>
      </div>

      <div className="-mt-2 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        <StepStrip label="Story Studio steps" steps={["Add clips", "Arrange", "Trim", "Preview", "Export"]} current={project.clips.length === 0 ? 0 : undefined} />
        <p className="text-[12.5px] text-ink-faint">
          {project.clips.length === 0
            ? "Start by adding moments to the timeline."
            : preview
              ? "Drag clips to arrange them, select one to trim it, and press play to preview. Changes stay in this tab."
              : "Drag clips in the timeline to arrange them, select one to trim it, press play to preview, then export an MP4."}
        </p>
      </div>

      {(issueCount > 0 || (persist?.removedCount ?? 0) > 0) && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3 text-[13px] text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {persist?.removedCount ? `${persist.removedCount} clip${persist.removedCount === 1 ? " was" : "s were"} removed because the source recording was deleted. ` : ""}
            {issueCount > 0 && `${issueCount} clip${issueCount === 1 ? "’s" : "s’"} source can’t be used (${[...new Set(project.clips.map((c) => issues[c.id]).filter(Boolean))].join(" ")}). Remove ${issueCount === 1 ? "it" : "them"} before exporting.`}
          </p>
        </div>
      )}

      {/* ── Preview + settings ──────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <SequencePreview project={project} library={library} seekTo={seekTo} onClipChange={setSelectedId} />

        </div>

        {/* Settings panel */}
        <aside aria-label="Edit settings" className="flex flex-col gap-5 rounded-2xl border border-line bg-surface-2/60 p-5">
          <section>
            <h2 className="text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Format</h2>
            <Segmented<Aspect>
              label="Aspect ratio"
              value={project.aspect}
              onChange={(aspect) => apply({ type: "setAspect", aspect })}
              className="mt-3 w-full [&>button]:flex-1"
              options={[
                { value: "16:9", label: <><RectangleHorizontal className="size-4" aria-hidden />16:9</> },
                { value: "9:16", label: <><RectangleVertical className="size-4" aria-hidden />9:16</> },
                { value: "1:1", label: <><Square className="size-3.5" aria-hidden />1:1</> },
              ]}
            />
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[14px] text-ink">
                <Captions className="size-4 text-ink-muted" aria-hidden /> Captions
              </span>
              <Switch label="Show captions" checked={project.captions} onCheckedChange={(enabled) => apply({ type: "setCaptions", enabled })} />
            </div>
            {library.source === "library" && (
              <div className="mt-4">
                <Segmented<"fill" | "fit">
                  label="Framing"
                  value={project.framing ?? "fill"}
                  onChange={(framing) => apply({ type: "setFraming", framing })}
                  className="w-full [&>button]:flex-1"
                  options={[
                    { value: "fill", label: "Fill · crop" },
                    { value: "fit", label: "Fit · bars" },
                  ]}
                />
                <p className="mt-2 text-[11.5px] text-ink-faint">How recordings that don’t match {project.aspect} are framed in the export.</p>
              </div>
            )}
          </section>

          <section className="border-t border-line pt-5" aria-live="polite">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Selected clip</h2>
            {selected && selRec && selBounds ? (
              <div className="mt-3">
                <div className="flex items-center gap-3">
                  <span className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
                    <ClipThumb rec={selRec} moment={selMoment} atMs={selMoment?.startMs ?? selected.inMs} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-ink">{selMoment?.title ?? selRec.title}</span>
                    <span className="block truncate text-[12px] text-ink-faint">
                      Clip {selectedIndex + 1} of {project.clips.length} · {seconds(clipDuration(selected))}
                    </span>
                  </span>
                </div>

                <label htmlFor="clip-caption" className="mt-5 block text-[13px] font-medium text-ink-muted">Caption</label>
                <input
                  id="clip-caption"
                  value={selected.caption ?? ""}
                  onChange={(e) => apply({ type: "setCaption", clipId: selected.id, caption: e.target.value }, `caption:${selected.id}`)}
                  placeholder="No caption"
                  disabled={!project.captions}
                  className="mt-1.5 h-10 w-full rounded-xl border border-line bg-surface px-3 text-[14px] text-ink outline-none placeholder:text-ink-faint focus-visible:border-accent/50 disabled:opacity-50"
                />

                <fieldset className="mt-5">
                  <legend className="text-[13px] font-medium text-ink-muted">Trim</legend>
                  {(["in", "out"] as const).map((edge) => {
                    const value = edge === "in" ? selected.inMs : selected.outMs;
                    return (
                      <label key={edge} className="mt-2 grid grid-cols-[2.5rem_1fr_3.5rem] items-center gap-3 text-[12.5px]">
                        <span className="text-ink-faint">{edge === "in" ? "In" : "Out"}</span>
                        <input
                          type="range"
                          min={selBounds.minMs}
                          max={selBounds.maxMs}
                          step={100}
                          value={value}
                          aria-label={`Trim ${edge} point`}
                          aria-valuetext={timecode(value)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            apply(
                              { type: "trim", clipId: selected.id, inMs: edge === "in" ? v : selected.inMs, outMs: edge === "out" ? v : selected.outMs },
                              `trim:${selected.id}:${edge}`,
                            );
                          }}
                          className="w-full"
                        />
                        <span className="text-right font-mono tabular-nums text-ink-muted">{timecode(value)}</span>
                      </label>
                    );
                  })}
                  <p className="mt-2 text-[11.5px] text-ink-faint">{selected.momentId ? "Up to 10 s of handles around the moment." : "Anywhere within the recording."}</p>
                </fieldset>

                <div className="mt-5 flex items-center gap-2">
                  <IconButton aria-label="Move clip earlier" onClick={() => apply({ type: "move", clipId: selected.id, toIndex: selectedIndex - 1 })} disabled={selectedIndex === 0} className="border border-line">
                    <ChevronLeft className="size-5" aria-hidden />
                  </IconButton>
                  <IconButton aria-label="Move clip later" onClick={() => apply({ type: "move", clipId: selected.id, toIndex: selectedIndex + 1 })} disabled={selectedIndex === project.clips.length - 1} className="border border-line">
                    <ChevronRight className="size-5" aria-hidden />
                  </IconButton>
                  <Button variant="ghost" size="sm" onClick={() => remove(selected.id)} className="ml-auto text-danger hover:bg-danger/10 hover:text-danger">
                    <Trash2 className="size-4" aria-hidden /> Remove
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-ink-faint">Select a clip in the timeline to caption, trim, or move it.</p>
            )}
          </section>
        </aside>
      </div>

      {/* ── Timeline ─────────────────────────────────────── */}
      <section aria-labelledby="timeline-label" className="rounded-2xl border border-line bg-surface-2/40 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="timeline-label" className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <Clapperboard className="size-4 text-ink-muted" aria-hidden /> Timeline
            <span className="font-normal text-ink-faint">· {project.clips.length} clips · {timecode(project.clips.reduce((s, c) => s + clipDuration(c), 0))}</span>
          </h2>
          <p className="text-[12px] text-ink-faint">
            Drag to reorder · <kbd className="font-mono">Alt</kbd>+<ArrowLeft className="inline size-3" aria-label="left" />/<ArrowRight className="inline size-3" aria-label="right" /> to move · <kbd className="font-mono">Delete</kbd> to remove
          </p>
        </div>
        {project.clips.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong py-10 text-center">
            <p className="text-[14px] text-ink-muted">Your timeline is empty.</p>
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>Add moments</Button>
          </div>
        ) : (
          <ClipTimeline
            clips={project.clips}
            library={library}
            selectedId={selectedId}
            onSelect={selectClip}
            onReorder={(clipIds) => apply({ type: "reorder", clipIds })}
            onMove={(clipId, toIndex) => apply({ type: "move", clipId, toIndex })}
            onRemove={remove}
            onAdd={() => setAddOpen(true)}
          />
        )}
      </section>

      {/* AI instruction (not connected yet): kept out of the main workflow until it works. */}
      <details className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-[12.5px] font-medium text-ink-faint transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          <Sparkles className="size-3.5" aria-hidden /> Coming later: describe an edit in words
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
        </summary>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="mt-3 rounded-2xl border border-line bg-surface-2/70 p-4"
          aria-describedby="ai-note"
        >
          <label htmlFor="ai-instruction" className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <Sparkles className="size-4 text-accent-ink" aria-hidden />
            Describe an edit
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="ai-instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="“Make it 30 seconds and start with the funniest moment”"
              className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 text-[14px] text-ink outline-none placeholder:text-ink-faint focus-visible:border-accent/50"
            />
            <Button type="submit" disabled>
              Apply edit
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {INSTRUCTION_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setInstruction(idea)}
                className="h-7 rounded-full border border-line px-2.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              >
                {idea}
              </button>
            ))}
          </div>
          <p id="ai-note" className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
            Natural-language editing isn’t connected yet. When it is, your instruction becomes a list of the same edits
            you can make by hand above — shown for review before anything changes.
          </p>
        </form>
      </details>

      {persist ? (
        <RealExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          project={project}
          storyId={persist.storyId}
          exports={story.exports}
          onRefresh={story.refresh}
          flush={flush}
          issues={Object.fromEntries(project.clips.filter((c) => issues[c.id]).map((c) => [c.id, issues[c.id]]))}
          preview={preview}
        />
      ) : (
        <ExportDialog open={exportOpen} onOpenChange={setExportOpen} project={project} library={library} />
      )}
      <AddMomentsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        candidates={candidates}
        library={library}
        inProject={inProject}
        onAdd={(m) => {
          const clip = clipFromMoment(m);
          apply({ type: "add", clip });
          setSelectedId(clip.id);
        }}
      />
    </div>
  );
}

type SaveState = "saved" | "saving" | "error";

const saveBody = (p: StoryProject) =>
  JSON.stringify({
    title: p.title,
    aspect: p.aspect,
    framing: p.framing ?? "fill",
    captions: p.captions,
    clips: p.clips.map((c) => ({ recordingId: c.recordingId, suggestionId: c.momentId, inMs: c.inMs, outMs: c.outMs, caption: c.caption })),
  });

/** Saves a real story shortly after each edit, on demand (before export), and when the page is hidden. */
function useAutosave(storyId: string | null, project: StoryProject) {
  const [save, setSave] = useState<SaveState>("saved");
  const saved = useRef(saveBody(project));
  const latest = useRef(project);
  useEffect(() => {
    latest.current = project;
  }, [project]);

  const flush = useCallback(async (): Promise<string | null> => {
    if (!storyId) return null;
    const body = saveBody(latest.current);
    if (body === saved.current) return null;
    setSave("saving");
    try {
      const res = await fetch(`/api/stories/${storyId}`, { method: "PUT", headers: { "Content-Type": "application/json", "x-metal-action": "1" }, body });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Saving failed (${res.status}).`);
      saved.current = body;
      setSave(saveBody(latest.current) === body ? "saved" : "saving");
      return null;
    } catch (err) {
      setSave("error");
      return err instanceof TypeError ? "Couldn’t reach the METAL server." : (err as Error).message;
    }
  }, [storyId]);

  useEffect(() => {
    if (!storyId || saveBody(project) === saved.current) return;
    const t = setTimeout(() => void flush(), 600);
    return () => clearTimeout(t);
  }, [storyId, project, flush]);

  useEffect(() => {
    if (!storyId) return;
    const onHide = () => {
      const body = saveBody(latest.current);
      if (body !== saved.current) void fetch(`/api/stories/${storyId}`, { method: "PUT", headers: { "Content-Type": "application/json", "x-metal-action": "1" }, body, keepalive: true });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [storyId]);

  return { save, flush };
}
