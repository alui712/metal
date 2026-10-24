// Data contracts shared by every METAL surface. The Phase 1 demo adapter
// and the Phase 2 database adapter both produce these shapes; field names
// mirror the SQLite schema in src/server/db/schema.ts.

/** Where the data came from. UI must label anything that isn't "library". */
export type DataSource = "demo" | "library";

export type ArtVariant = "city" | "ridge" | "peaks" | "arena" | "orbit";

/** Procedural poster art used when no real frame thumbnail exists. */
export type ArtSpec = {
  variant: ArtVariant;
  /** Base hue (0–360) for the scene palette. */
  hue: number;
  seed: number;
};

/** How a recording can be played. Demo fixtures have no media file. */
export type MediaSource =
  | { kind: "demo" }
  | { kind: "video"; src: string; poster?: string };

export type Game = {
  id: string;
  name: string;
  genre: string;
  art: ArtSpec;
};

export type Recording = {
  id: string;
  title: string;
  gameId: string;
  sessionId: string | null;
  /** Whose perspective (for Multi-POV later). */
  ownerLabel: string;
  /** Epoch ms. */
  recordedAt: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  sizeBytes: number;
  container: string;
  art: ArtSpec;
  media: MediaSource;
  source: DataSource;
};

export type MomentKind =
  | "clutch"
  | "victory"
  | "funny"
  | "fail"
  | "highlight"
  | "reaction";

export type TranscriptLine = {
  /** Offset from the start of the recording, ms. */
  tMs: number;
  speaker: string;
  text: string;
};

export type Moment = {
  id: string;
  recordingId: string;
  startMs: number;
  endMs: number;
  title: string;
  kind: MomentKind;
  /** 0–1 importance. */
  score: number;
  /** What is visible on screen. */
  caption: string;
  transcript: TranscriptLine[];
  /** Peak loudness 0–1, if an audio spike was detected. */
  audioPeak: number | null;
  tags: string[];
};

export type Session = {
  id: string;
  title: string;
  summary: string;
  gameId: string;
  startedAt: number;
  endedAt: number;
  friends: string[];
  recordingIds: string[];
  coverMomentId: string;
  art: ArtSpec;
  source: DataSource;
};

export type EvidenceKind = "speech" | "visual" | "audio" | "title";

export type Evidence = {
  kind: EvidenceKind;
  /** Text shown to the user, e.g. the transcript line that matched. */
  text: string;
  /** Terms in `text` that matched the query (for highlighting). */
  matched: string[];
  tMs: number;
  speaker?: string;
};

export type SearchFilters = {
  gameIds?: string[];
  evidence?: EvidenceKind[];
};

export type SearchResult = {
  moment: Moment;
  recording: Recording;
  session: Session | null;
  score: number;
  /** Where in the recording playback should start. */
  seekMs: number;
  evidence: Evidence[];
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  /** Human-readable description of how matching was done. */
  method: string;
  source: DataSource;
};

export type Aspect = "16:9" | "9:16" | "1:1";

export type StoryClip = {
  id: string;
  recordingId: string;
  momentId: string | null;
  inMs: number;
  outMs: number;
  caption: string | null;
};

export type StoryProject = {
  id: string;
  title: string;
  aspect: Aspect;
  captions: boolean;
  clips: StoryClip[];
  sourceSessionId: string | null;
};
