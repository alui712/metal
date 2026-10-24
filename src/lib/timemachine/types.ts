// Client-safe Time Machine shapes (no paths). Built from real rows by
// src/server/timemachine/; every field traces to stored data.

export type TimeSource = "filename" | "metadata" | "capture" | "file-date" | "parent" | "manual";

export const TIME_SOURCE_LABEL: Record<TimeSource, string> = {
  filename: "from the file name",
  metadata: "from the video’s metadata",
  capture: "recorded by OBS",
  "file-date": "from the file’s date — may be when it was copied",
  parent: "from the source recording",
  manual: "set by you",
};

export type SessionSummary = {
  id: string;
  title: string;
  /** The user named it; otherwise the title is the day and time of day. */
  titleIsCustom: boolean;
  game: string | null;
  startedAt: number;
  endedAt: number;
  /** false: no member has a known recording time, so startedAt/endedAt mean nothing. */
  timeKnown: boolean;
  /** Some recording times come only from file dates. */
  approximate: boolean;
  /** Grouping was edited by the user. */
  locked: boolean;
  recordingCount: number;
  footageMs: number;
  momentCount: number;
  favoriteCount: number;
  transcriptLines: number;
  analyzedCount: number;
  coverUrl: string | null;
};

export type TimelineRecording = {
  id: string;
  title: string;
  origin: string;
  /** Wall-clock start (epoch ms), or null when unknown. */
  startAt: number | null;
  timeSource: TimeSource | null;
  durationMs: number;
  posterUrl: string | null;
  videoUrl: string | null;
  analysis: "none" | "queued" | "running" | "done" | "failed";
  transcript: "none" | "queued" | "running" | "done" | "failed";
  momentCount: number;
};

export type TimelineMoment = {
  /** The Smart Clip suggestion id. */
  id: string;
  recordingId: string;
  /** Offsets within the recording. */
  startMs: number;
  endMs: number;
  /** Wall-clock time of the start, or null when the recording's time is unknown. */
  at: number | null;
  title: string;
  confidence: "strong" | "moderate" | "weak";
  evidence: Array<{ kind: string; startMs: number; endMs: number; label: string; detail: string }>;
  speech: Array<{ startMs: number; endMs: number; text: string; nearEvent: boolean }>;
  uncertainty: string;
  thumbUrl: string | null;
  favorite: boolean;
  saved: boolean;
};

export type SessionDetail = {
  summary: SessionSummary;
  recordings: TimelineRecording[];
  moments: TimelineMoment[];
  /** Other sessions, for "move to" / "merge into". */
  others: Array<{ id: string; title: string; startedAt: number }>;
};

export type TimeMachineOverview = {
  sessions: SessionSummary[];
  undated: TimelineRecording[];
  ungrouped: TimelineRecording[];
  gapMinutes: number;
  games: string[];
};

export const GAP_CHOICES = [15, 30, 45, 60, 90, 120, 240] as const;
