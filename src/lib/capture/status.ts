// The capture engine's state as the UI should present it. Until the OBS
// adapter exists (Phase 3) this is the only honest answer: not connected.
// The shape is what the live adapter will report.

export type CaptureConnection = "not-connected" | "connecting" | "connected" | "error";

export type CaptureStatus = {
  engine: "obs";
  connection: CaptureConnection;
  recording: boolean;
  replayBufferActive: boolean;
  /** One-line explanation shown next to the state. */
  detail: string;
  /** When the missing piece arrives, for unavailable controls. */
  availableIn: string | null;
};

export const CAPTURE_STATUS: CaptureStatus = {
  engine: "obs",
  connection: "not-connected",
  recording: false,
  replayBufferActive: false,
  detail: "METAL records through OBS. The OBS connection arrives in Phase 3.",
  availableIn: "Phase 3",
};

export const CONNECTION_LABEL: Record<CaptureConnection, string> = {
  "not-connected": "Not connected",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Connection failed",
};
