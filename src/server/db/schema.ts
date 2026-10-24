import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  blob,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// All timestamps are epoch milliseconds. All media offsets are milliseconds
// relative to the start of the recording.

const createdAt = () =>
  integer("created_at")
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`);

export const recordings = sqliteTable(
  "recordings",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    game: text("game"),
    ownerLabel: text("owner_label"),
    originalPath: text("original_path").notNull(),
    originalFilename: text("original_filename").notNull(),
    proxyPath: text("proxy_path"),
    posterPath: text("poster_path"),
    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    fps: real("fps"),
    sizeBytes: integer("size_bytes"),
    /** SHA-256 of the original file; unique, so re-importing the same video is a no-op. */
    contentHash: text("content_hash"),
    /** ffprobe format name, e.g. "mov,mp4,m4a,3gp,3g2,mj2". */
    container: text("container"),
    videoCodec: text("video_codec"),
    audioCodec: text("audio_codec"),
    /** How it arrived: a manual upload, an OBS replay-buffer clip, or a full OBS recording. */
    origin: text("origin", { enum: ["upload", "obs-replay", "obs-recording"] })
      .notNull()
      .default("upload"),
    recordedAt: integer("recorded_at"),
    importedAt: createdAt(),
    status: text("status", {
      enum: ["imported", "processing", "ready", "analyzed", "failed"],
    })
      .notNull()
      .default("imported"),
    error: text("error"),
    sessionId: text("session_id").references((): AnySQLiteColumn => sessions.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("recordings_session_idx").on(t.sessionId),
    uniqueIndex("recordings_content_hash_idx").on(t.contentHash),
    index("recordings_recorded_at_idx").on(t.recordedAt),
  ],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    recordingId: text("recording_id").references(() => recordings.id, {
      onDelete: "cascade",
    }),
    payloadJson: text("payload_json").notNull().default("{}"),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed"],
    })
      .notNull()
      .default("queued"),
    stage: text("stage"),
    progress: real("progress").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(2),
    error: text("error"),
    createdAt: createdAt(),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
    heartbeatAt: integer("heartbeat_at"),
  },
  (t) => [
    index("jobs_status_idx").on(t.status, t.createdAt),
    index("jobs_recording_idx").on(t.recordingId),
  ],
);

/** Liveness record written by each worker process. */
export const workers = sqliteTable("workers", {
  id: text("id").primaryKey(),
  pid: integer("pid").notNull(),
  startedAt: integer("started_at").notNull(),
  heartbeatAt: integer("heartbeat_at").notNull(),
  currentJobId: text("current_job_id"),
});

/**
 * Live OBS state, published by the worker’s capture service (single row,
 * id = 1). Never contains credentials.
 */
export const captureState = sqliteTable("capture_state", {
  id: integer("id").primaryKey(),
  connection: text("connection", { enum: ["disabled", "connecting", "connected", "error"] })
    .notNull()
    .default("disabled"),
  error: text("error"),
  obsVersion: text("obs_version"),
  recording: integer("recording", { mode: "boolean" }).notNull().default(false),
  recordDurationMs: integer("record_duration_ms").notNull().default(0),
  replayActive: integer("replay_active", { mode: "boolean" }).notNull().default(false),
  /** Replay length OBS is actually configured with (seconds), if readable. */
  replaySeconds: integer("replay_seconds"),
  replayAvailable: integer("replay_available", { mode: "boolean" }).notNull().default(false),
  lastClipStatus: text("last_clip_status", { enum: ["saving", "importing", "imported", "duplicate", "failed"] }),
  lastClipKind: text("last_clip_kind", { enum: ["replay", "recording"] }),
  lastClipAt: integer("last_clip_at"),
  lastClipRecordingId: text("last_clip_recording_id"),
  lastClipError: text("last_clip_error"),
  updatedAt: integer("updated_at").notNull(),
});

/** Capture actions requested by the UI, executed by the worker. */
export const captureCommands = sqliteTable(
  "capture_commands",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    status: text("status", { enum: ["pending", "done", "failed"] })
      .notNull()
      .default("pending"),
    error: text("error"),
    resultJson: text("result_json"),
    createdAt: createdAt(),
    finishedAt: integer("finished_at"),
  },
  (t) => [index("capture_commands_status_idx").on(t.status, t.createdAt)],
);

/** Provenance ledger: every model-generated result is recorded here. */
export const aiOutputs = sqliteTable(
  "ai_outputs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputRefsJson: text("input_refs_json").notNull().default("[]"),
    outputJson: text("output_json").notNull(),
    jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_outputs_kind_idx").on(t.kind)],
);

export const transcriptSegments = sqliteTable(
  "transcript_segments",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    speaker: text("speaker"),
    confidence: real("confidence"),
  },
  (t) => [index("transcript_recording_idx").on(t.recordingId, t.startMs)],
);

export const frames = sqliteTable(
  "frames",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    tMs: integer("t_ms").notNull(),
    path: text("path").notNull(),
    isSceneChange: integer("is_scene_change", { mode: "boolean" })
      .notNull()
      .default(false),
    phash: text("phash"),
  },
  (t) => [uniqueIndex("frames_recording_t_idx").on(t.recordingId, t.tMs)],
);

export const visualObservations = sqliteTable(
  "visual_observations",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    frameId: text("frame_id")
      .notNull()
      .references(() => frames.id, { onDelete: "cascade" }),
    tMs: integer("t_ms").notNull(),
    caption: text("caption").notNull(),
    tagsJson: text("tags_json").notNull().default("[]"),
    eventsJson: text("events_json").notNull().default("[]"),
    aiOutputId: text("ai_output_id")
      .notNull()
      .references(() => aiOutputs.id, { onDelete: "cascade" }),
  },
  (t) => [index("observations_recording_idx").on(t.recordingId, t.tMs)],
);

export const audioEvents = sqliteTable(
  "audio_events",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    kind: text("kind", { enum: ["loudness_peak", "silence"] }).notNull(),
    score: real("score").notNull(),
  },
  (t) => [index("audio_events_recording_idx").on(t.recordingId, t.startMs)],
);

export const moments = sqliteTable(
  "moments",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    title: text("title"),
    kind: text("kind").notNull(),
    score: real("score").notNull(),
    thumbFrameId: text("thumb_frame_id").references(() => frames.id, {
      onDelete: "set null",
    }),
    /** { transcript: id[], observations: id[], audio: id[] } */
    sourcesJson: text("sources_json").notNull().default("{}"),
  },
  (t) => [index("moments_recording_idx").on(t.recordingId, t.startMs)],
);

/** Retrieval units. Mirrored into the `chunks_fts` FTS5 table by triggers. */
export const chunks = sqliteTable(
  "chunks",
  {
    id: text("id").primaryKey(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    momentId: text("moment_id").references(() => moments.id, {
      onDelete: "set null",
    }),
    source: text("source", {
      enum: ["transcript", "visual", "moment"],
    }).notNull(),
    sourceRefId: text("source_ref_id"),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    embedding: blob("embedding", { mode: "buffer" }),
    embedModel: text("embed_model"),
  },
  (t) => [index("chunks_recording_idx").on(t.recordingId)],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title"),
  summary: text("summary"),
  game: text("game"),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
  coverFrameId: text("cover_frame_id"),
  aiOutputId: text("ai_output_id").references(() => aiOutputs.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

export const storyProjects = sqliteTable("story_projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  aspect: text("aspect", { enum: ["16:9", "9:16", "1:1"] })
    .notNull()
    .default("16:9"),
  sourceSessionId: text("source_session_id").references(() => sessions.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: integer("updated_at").notNull(),
});

export const storyClips = sqliteTable(
  "story_clips",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => storyProjects.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    recordingId: text("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    momentId: text("moment_id").references(() => moments.id, {
      onDelete: "set null",
    }),
    inMs: integer("in_ms").notNull(),
    outMs: integer("out_ms").notNull(),
    caption: text("caption"),
  },
  (t) => [index("story_clips_project_idx").on(t.projectId, t.position)],
);

export const storyEdits = sqliteTable("story_edits", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => storyProjects.id, { onDelete: "cascade" }),
  prompt: text("prompt"),
  opsJson: text("ops_json").notNull(),
  /** Full EDL before the edit, for undo. */
  beforeJson: text("before_json").notNull(),
  aiOutputId: text("ai_output_id").references(() => aiOutputs.id, {
    onDelete: "set null",
  }),
  appliedAt: createdAt(),
});

export const renderExports = sqliteTable("exports", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => storyProjects.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["queued", "running", "succeeded", "failed"],
  })
    .notNull()
    .default("queued"),
  outputPath: text("output_path"),
  durationMs: integer("duration_ms"),
  sizeBytes: integer("size_bytes"),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  ffmpegCmd: text("ffmpeg_cmd"),
  createdAt: createdAt(),
});
