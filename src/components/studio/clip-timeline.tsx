"use client";

import { Reorder } from "motion/react";
import { GripVertical, Plus } from "lucide-react";
import { useState } from "react";
import type { StoryClip } from "@/lib/memory/contracts";
import { clipDuration } from "@/lib/studio/edl";
import { seconds } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ClipThumb } from "./clip-thumb";
import type { StudioLibrary } from "./types";

const PX_PER_SEC = 9;
const MIN_W = 132;

/**
 * Horizontal clip strip. Drag to reorder (committed on drop as one undo
 * step); keyboard: Alt+←/→ moves the focused clip, Delete removes it.
 */
export function ClipTimeline({
  clips,
  library,
  selectedId,
  onSelect,
  onReorder,
  onMove,
  onRemove,
  onAdd,
}: {
  clips: StoryClip[];
  library: StudioLibrary;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onMove: (id: string, toIndex: number) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const order = draft ?? clips.map((c) => c.id);
  const byId = new Map(clips.map((c) => [c.id, c]));

  function onKeyDown(e: React.KeyboardEvent, clip: StoryClip, index: number) {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      onMove(clip.id, index + (e.key === "ArrowRight" ? 1 : -1));
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-clip="${clip.id}"]`)?.focus());
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = clips[index + (e.key === "ArrowRight" ? 1 : -1)];
      if (next) {
        onSelect(next.id);
        document.querySelector<HTMLElement>(`[data-clip="${next.id}"]`)?.focus();
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const neighbor = clips[index + 1] ?? clips[index - 1];
      onRemove(clip.id);
      if (neighbor) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-clip="${neighbor.id}"]`)?.focus());
    }
  }

  return (
    <div className="scrollbar-none overflow-x-auto pb-2">
      <div className="flex min-w-max items-stretch gap-2">
        <Reorder.Group
          as="ol"
          axis="x"
          values={order}
          onReorder={setDraft}
          className="flex items-stretch gap-2"
          aria-label="Story clips in order"
        >
          {order.map((id, index) => {
            const clip = byId.get(id);
            if (!clip) return null;
            const rec = library.recordings[clip.recordingId];
            const moment = clip.momentId ? library.moments[clip.momentId] : undefined;
            const isSel = clip.id === selectedId;
            const width = Math.max(MIN_W, (clipDuration(clip) / 1000) * PX_PER_SEC);
            return (
              <Reorder.Item
                key={id}
                value={id}
                as="li"
                layout="position"
                onDragEnd={() => {
                  if (draft) onReorder(draft);
                  setDraft(null);
                }}
                whileDrag={{ scale: 1.04, zIndex: 10, boxShadow: "0 20px 40px -12px rgb(0 0 0 / 0.8)" }}
                className="relative cursor-grab touch-pan-y list-none rounded-xl active:cursor-grabbing"
                style={{ width }}
              >
                <button
                  type="button"
                  data-clip={clip.id}
                  onClick={() => onSelect(clip.id)}
                  onKeyDown={(e) => onKeyDown(e, clip, index)}
                  aria-pressed={isSel}
                  aria-label={`Clip ${index + 1}: ${moment?.title ?? rec?.title}, ${seconds(clipDuration(clip))}${library.issues?.[clip.id] ? `. ${library.issues[clip.id]}` : ""}. Alt+arrows to move, Delete to remove.`}
                  className={cn(
                    "group flex h-full w-full flex-col overflow-hidden rounded-xl border bg-surface-3 text-left transition-colors",
                    isSel ? "border-accent shadow-[0_0_0_1px_var(--violet-500)]" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="relative block h-16 w-full overflow-hidden">
                    {rec && <ClipThumb rec={rec} moment={moment} atMs={moment?.startMs ?? clip.inMs} />}
                    <span className="absolute left-1.5 top-1.5 grid size-5 place-items-center rounded bg-black/60 font-mono text-[10px] text-white">
                      {index + 1}
                    </span>
                    <GripVertical className="absolute right-1 top-1.5 size-4 text-white/60 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    {library.issues?.[clip.id] && (
                      <span className="absolute inset-x-0 bottom-0 bg-danger/85 px-1.5 py-0.5 text-[10px] font-medium text-white" title={library.issues[clip.id]}>
                        Source unavailable
                      </span>
                    )}
                  </span>
                  <span className="block px-2.5 py-2">
                    <span className="block truncate text-[12.5px] font-medium text-ink">{moment?.title ?? rec?.title}</span>
                    <span className="block truncate font-mono text-[11px] tabular-nums text-ink-faint">{seconds(clipDuration(clip))}</span>
                  </span>
                </button>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
        <button
          type="button"
          onClick={onAdd}
          className="flex w-28 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-[12.5px] font-medium text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
        >
          <Plus className="size-5" aria-hidden />
          Add moments
        </button>
      </div>
    </div>
  );
}
