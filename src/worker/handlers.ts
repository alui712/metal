import type { Db } from "../server/db/client";
import type { Job } from "../server/jobs/queue";
import { analyzeRecording } from "../server/analysis/analyze";
import { importObsFile } from "../server/capture/import";
import { ingestRecording } from "../server/media/ingest";
import { exportClip } from "../server/smartclip/export";
import { importFolderFile } from "../server/sources/import";

export type JobContext = {
  db: Db;
  job: Job;
  /** Report stage/progress; also refreshes the job heartbeat. */
  progress: (update: { stage?: string; progress?: number }) => void;
  signal: AbortSignal;
};

export type JobHandler = (ctx: JobContext) => Promise<void>;

/** Job kind → handler. Feature phases register their handlers here. */
export const handlers: Record<string, JobHandler> = {
  ingest: ingestRecording,
  "obs-import": importObsFile,
  "folder-import": importFolderFile,
  analyze: analyzeRecording,
  "clip-export": exportClip,
};
