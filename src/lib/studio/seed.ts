import type { Moment, StoryClip, StoryProject } from "../memory/contracts";
import type { MemoryRepository } from "../memory/repository";
import type { TrimBounds } from "./edl";

/** Extra source footage around a moment that trimming may reveal. */
export const HANDLE_MS = 10_000;

export function clipFromMoment(m: Moment): StoryClip {
  return {
    id: `clip_${m.id}`,
    recordingId: m.recordingId,
    momentId: m.id,
    inMs: m.startMs,
    outMs: m.endMs,
    caption: m.title,
  };
}

/**
 * Starting edit for the studio: a session's strongest moments in the order
 * they happened, or the library's best moments when no session is given.
 */
export function seedProject(repo: MemoryRepository, sessionId: string | null): StoryProject {
  const session = sessionId ? repo.session(sessionId) : undefined;
  if (session) {
    const moments = repo.momentsForSession(session.id);
    const keep = new Set([...moments].sort((a, b) => b.score - a.score).slice(0, 6).map((m) => m.id));
    return {
      id: `story_${session.id}`,
      title: session.title,
      aspect: "16:9",
      captions: true,
      sourceSessionId: session.id,
      clips: moments.filter((m) => keep.has(m.id)).map(clipFromMoment),
    };
  }
  return {
    id: "story_best_of",
    title: "Best of the season",
    aspect: "16:9",
    captions: true,
    sourceSessionId: null,
    clips: repo.topMoments(6).map(clipFromMoment),
  };
}

/** What trimming needs to know about sources (the demo repository satisfies it; so does the real library). */
export type SourceLookup = {
  recording(id: string): { durationMs: number } | undefined;
  moment(id: string): { startMs: number; endMs: number } | undefined;
};

export function trimBounds(repo: SourceLookup, clips: StoryClip[]): TrimBounds {
  return Object.fromEntries(
    clips.map((c) => {
      const rec = repo.recording(c.recordingId);
      const m = c.momentId ? repo.moment(c.momentId) : undefined;
      const maxRec = rec?.durationMs ?? c.outMs;
      return [
        c.id,
        m
          ? { minMs: Math.max(0, m.startMs - HANDLE_MS), maxMs: Math.min(maxRec, m.endMs + HANDLE_MS) }
          : { minMs: 0, maxMs: maxRec },
      ];
    }),
  );
}
