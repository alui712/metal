// Client-safe capture state, published by the worker's OBS service and
// served by /api/capture. Never contains credentials or file paths.

export type CaptureConnection = "not-configured" | "worker-offline" | "connecting" | "connected" | "error";

export type ClipStatus = "saving" | "importing" | "imported" | "duplicate" | "failed";

export type CaptureView = {
  configured: boolean;
  workerOnline: boolean;
  connection: CaptureConnection;
  error: string | null;
  obsVersion: string | null;
  recording: boolean;
  recordDurationMs: number;
  replayActive: boolean;
  /** OBS has a replay buffer configured (Settings → Output). */
  replayAvailable: boolean;
  /** The replay length OBS is actually using, in seconds. */
  replaySeconds: number | null;
  lastClip: { status: ClipStatus; kind: "replay" | "recording"; at: number; recordingId: string | null; error: string | null } | null;
  updatedAt: number | null;
};

/** Before the first poll answers. Never implies a connection. */
export const INITIAL_CAPTURE: CaptureView = {
  configured: false,
  workerOnline: false,
  connection: "not-configured",
  error: null,
  obsVersion: null,
  recording: false,
  recordDurationMs: 0,
  replayActive: false,
  replayAvailable: false,
  replaySeconds: null,
  lastClip: null,
  updatedAt: null,
};

export const CONNECTION_LABEL: Record<CaptureConnection, string> = {
  "not-configured": "Not connected",
  "worker-offline": "Worker offline",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Not connected",
};
