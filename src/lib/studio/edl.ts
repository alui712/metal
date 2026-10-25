import type { Aspect, SplitPov, StoryClip, StoryProject } from "../memory/contracts";

// Edit decision list operations. Pure and deterministic: the editor UI, undo
// history, and (later) natural-language edit plans all go through these.

export const MIN_CLIP_MS = 1000;

export type EdlOp =
  | { type: "move"; clipId: string; toIndex: number }
  | { type: "reorder"; clipIds: string[] }
  | { type: "remove"; clipId: string }
  | { type: "add"; clip: StoryClip; index?: number }
  | { type: "trim"; clipId: string; inMs: number; outMs: number }
  | { type: "setCaption"; clipId: string; caption: string | null }
  | { type: "setAspect"; aspect: Aspect }
  | { type: "setCaptions"; enabled: boolean }
  | { type: "setFraming"; framing: "fill" | "fit" }
  | { type: "setTitle"; title: string };

/** Source bounds a trim may not exceed (the clip's recording/moment range). */
export type TrimBounds = Record<string, { minMs: number; maxMs: number }>;

export function applyOp(project: StoryProject, op: EdlOp, bounds: TrimBounds = {}): StoryProject {
  const clips = project.clips;
  switch (op.type) {
    case "move": {
      const from = clips.findIndex((c) => c.id === op.clipId);
      if (from < 0) return project;
      const to = Math.max(0, Math.min(clips.length - 1, op.toIndex));
      if (from === to) return project;
      const next = [...clips];
      const [clip] = next.splice(from, 1);
      next.splice(to, 0, clip);
      return { ...project, clips: next };
    }
    case "reorder": {
      // Must be a permutation of the current clips; otherwise ignore.
      if (op.clipIds.length !== clips.length) return project;
      const byId = new Map(clips.map((c) => [c.id, c]));
      const next = op.clipIds.map((id) => byId.get(id));
      if (next.some((c) => !c) || new Set(op.clipIds).size !== clips.length) return project;
      return { ...project, clips: next as StoryClip[] };
    }
    case "remove":
      return clips.some((c) => c.id === op.clipId)
        ? { ...project, clips: clips.filter((c) => c.id !== op.clipId) }
        : project;
    case "add": {
      if (clips.some((c) => c.id === op.clip.id)) return project;
      const next = [...clips];
      next.splice(op.index ?? next.length, 0, op.clip);
      return { ...project, clips: next };
    }
    case "trim": {
      const b = bounds[op.clipId];
      return mapClip(project, op.clipId, (c) => {
        const minMs = b?.minMs ?? 0;
        const maxMs = b?.maxMs ?? Number.POSITIVE_INFINITY;
        let inMs = Math.max(minMs, Math.round(op.inMs));
        let outMs = Math.min(maxMs, Math.round(op.outMs));
        if (outMs - inMs < MIN_CLIP_MS) {
          // Keep the edge the user didn't move; push the other.
          if (inMs !== c.inMs) inMs = outMs - MIN_CLIP_MS;
          else outMs = inMs + MIN_CLIP_MS;
        }
        const next = { ...c, inMs: Math.max(minMs, inMs), outMs: Math.min(maxMs, outMs) };
        // The second POV moves with the primary's in-point, so they stay aligned.
        return c.secondary ? { ...next, secondary: { ...c.secondary, inMs: c.secondary.inMs + (next.inMs - c.inMs) } } : next;
      });
    }
    case "setCaption":
      return mapClip(project, op.clipId, (c) => ({
        ...c,
        caption: op.caption?.trim() ? op.caption : null,
      }));
    case "setAspect":
      return { ...project, aspect: op.aspect };
    case "setCaptions":
      return { ...project, captions: op.enabled };
    case "setFraming":
      return project.framing === op.framing ? project : { ...project, framing: op.framing };
    case "setTitle":
      return { ...project, title: op.title };
  }
}

function mapClip(
  project: StoryProject,
  clipId: string,
  fn: (c: StoryClip) => StoryClip,
): StoryProject {
  let changed = false;
  const clips = project.clips.map((c) => {
    if (c.id !== clipId) return c;
    changed = true;
    return fn(c);
  });
  return changed ? { ...project, clips } : project;
}

/**
 * Comparable key of what a render depends on (mirrored by the server's export
 * records), so the UI can tell whether an export matches the current edit.
 */
export function edlKey(p: { aspect: string; framing?: string; captions: boolean; clips: Array<{ recordingId: string | null; inMs: number; outMs: number; caption: string | null; secondary?: SplitPov | null }> }): string {
  return JSON.stringify([
    p.aspect,
    p.framing ?? "fill",
    p.captions,
    p.clips.map((c) => {
      const k: unknown[] = [c.recordingId, c.inMs, c.outMs, p.captions ? (c.caption?.trim() ? c.caption.slice(0, 200) : "") : ""];
      return c.secondary ? [...k, c.secondary.recordingId, c.secondary.inMs] : k;
    }),
  ]);
}

/** A side-by-side clip's second POV time at primary time `ownMs` (same moment, its own clock). */
export const secondaryTime = (c: { inMs: number; secondary?: SplitPov | null }, ownMs: number) => (c.secondary ? c.secondary.inMs + (ownMs - c.inMs) : null);

export function clipDuration(c: StoryClip): number {
  return c.outMs - c.inMs;
}

export function totalDuration(project: StoryProject): number {
  return project.clips.reduce((sum, c) => sum + clipDuration(c), 0);
}

/** Maps a time on the story timeline to the clip playing at that time. */
export function locate(
  project: StoryProject,
  tMs: number,
): { index: number; clip: StoryClip; offsetMs: number; clipStartMs: number } | null {
  let start = 0;
  for (const [index, clip] of project.clips.entries()) {
    const d = clipDuration(clip);
    if (tMs < start + d || index === project.clips.length - 1) {
      return { index, clip, offsetMs: Math.min(Math.max(tMs - start, 0), d), clipStartMs: start };
    }
    start += d;
  }
  return null;
}

// ── History ────────────────────────────────────────────────────────────────

export type History = {
  past: StoryProject[];
  present: StoryProject;
  future: StoryProject[];
};

const HISTORY_LIMIT = 100;

export function initHistory(project: StoryProject): History {
  return { past: [], present: project, future: [] };
}

export type HistoryAction =
  | { type: "apply"; op: EdlOp; bounds?: TrimBounds; /** merge into the previous step (e.g. slider drags) */ coalesce?: boolean }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; project: StoryProject };

export function historyReducer(h: History, action: HistoryAction): History {
  switch (action.type) {
    case "apply": {
      const next = applyOp(h.present, action.op, action.bounds);
      if (next === h.present) return h;
      const past = action.coalesce && h.past.length ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
      return { past, present: next, future: [] };
    }
    case "undo": {
      if (!h.past.length) return h;
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
    }
    case "redo": {
      if (!h.future.length) return h;
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
    }
    case "reset":
      return initHistory(action.project);
  }
}
