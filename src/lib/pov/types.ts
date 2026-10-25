// Client mirrors of the Multi-POV views (src/server/pov/povs.ts). No paths.

export type TimeEvidence =
  | { kind: "overlap"; overlapMs: number; clockOffsetMs: number; approximate: boolean }
  | { kind: "near"; gapMs: number; clockOffsetMs: number; approximate: boolean }
  | { kind: "unknown" }
  | { kind: "apart" };

export type PovMember = {
  recordingId: string;
  title: string;
  playerName: string | null;
  game: string | null;
  offsetMs: number;
  durationMs: number;
  fps: number | null;
  recordedAt: number | null;
  syncSource: "anchor" | "clock" | "audio" | "manual";
  syncConfirmed: boolean;
  audioScore: number | null;
  videoUrl: string | null;
  posterUrl: string | null;
};

export type PovGroupView = { id: string; members: PovMember[]; startMs: number; endMs: number };

/** A group as the Multi-POV landing page lists it. */
export type PovGroupSummary = PovGroupView & {
  updatedAt: number;
  /** How long every POV has footage at once (0 when they never all overlap). */
  sharedMs: number;
  /** Every non-anchor offset was confirmed or set by the user. */
  confirmed: boolean;
  method: "audio" | "clock" | "manual" | "mixed";
};

export type PovCandidate = {
  recordingId: string;
  title: string;
  playerName: string | null;
  game: string | null;
  durationMs: number;
  recordedAt: number | null;
  posterUrl: string | null;
  time: TimeEvidence;
  sameGame: boolean;
  audio: { status: "reliable" | "weak" | "none" | "no-audio" | "error"; offsetMs: number | null; score: number | null; distinct: number | null; overlapMs: number | null } | null;
  /** Best available offset of the candidate's 0:00 on this recording's timeline, and where it came from. */
  suggested: { offsetMs: number; source: "audio" | "clock" } | null;
  /** "likely": shared audio lines up. "possible": only the clocks (or game) say so. */
  confidence: "likely" | "possible";
  pairedHere: boolean;
};

export type PovView = {
  recordingId: string;
  group: PovGroupView | null;
  candidates: PovCandidate[];
  /** Recordings with unknown times that audio didn't match (not shown as candidates). */
  undatedChecked: number;
  checkedAt: number | null;
  job: { status: string; progress: number; error: string | null } | null;
  /** Other recordings the user may pair by hand. */
  pairable: Array<{ id: string; title: string; recordedAt: number | null; durationMs: number }>;
};
