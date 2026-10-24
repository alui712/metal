import { and, eq, lt } from "drizzle-orm";
import type { CaptureView } from "../../lib/capture/status";
import type { Db } from "../db/client";
import { captureCommands, captureState } from "../db/schema";
import { newId } from "../ids";
import { getLiveWorker } from "../jobs/queue";
import { readObsConfig } from "./config";

type StateRow = typeof captureState.$inferSelect;
export type StatePatch = Partial<Omit<StateRow, "id" | "updatedAt">>;

/** The worker publishes at least every 500 ms; older than this means it stopped. */
export const STATE_STALE_MS = 5000;

export function writeCaptureState(db: Db, patch: StatePatch, now = Date.now()): void {
  db.insert(captureState)
    .values({ id: 1, ...patch, updatedAt: now })
    .onConflictDoUpdate({ target: captureState.id, set: { ...patch, updatedAt: now } })
    .run();
}

export function readCaptureState(db: Db): StateRow | undefined {
  return db.select().from(captureState).where(eq(captureState.id, 1)).get();
}

/** Client-safe view. Never includes credentials or file paths. */
export function captureView(db: Db, now = Date.now()): CaptureView {
  const cfg = readObsConfig();
  const row = readCaptureState(db);
  const workerOnline = Boolean(getLiveWorker(db, now)) && Boolean(row) && now - row!.updatedAt < STATE_STALE_MS;
  const configured = Boolean(cfg?.enabled);
  const live = workerOnline && configured && row?.connection === "connected";
  return {
    configured,
    workerOnline,
    connection: !configured ? "not-configured" : !workerOnline ? "worker-offline" : row!.connection === "disabled" ? "connecting" : row!.connection,
    error: configured && workerOnline ? (row?.error ?? null) : null,
    obsVersion: live ? (row!.obsVersion ?? null) : null,
    recording: live && row!.recording,
    recordDurationMs: live ? row!.recordDurationMs : 0,
    replayActive: live && row!.replayActive,
    replayAvailable: live && row!.replayAvailable,
    replaySeconds: live ? (row!.replaySeconds ?? null) : null,
    lastClip:
      row?.lastClipStatus && row.lastClipAt
        ? {
            status: row.lastClipStatus,
            kind: row.lastClipKind ?? "replay",
            at: row.lastClipAt,
            recordingId: row.lastClipRecordingId,
            error: row.lastClipError,
          }
        : null,
    updatedAt: row?.updatedAt ?? null,
  };
}

// ── Commands (UI → worker) ─────────────────────────────────

export const CAPTURE_ACTIONS = ["start-record", "stop-record", "start-replay", "stop-replay", "save-replay"] as const;
export type CaptureAction = (typeof CAPTURE_ACTIONS)[number];
/** A command not picked up within this window is dropped, never run late. */
export const COMMAND_TTL_MS = 10_000;

export function enqueueCommand(db: Db, action: CaptureAction, payload: Record<string, unknown> = {}): string {
  const id = newId("cmd");
  db.insert(captureCommands).values({ id, action, payloadJson: JSON.stringify(payload) }).run();
  return id;
}

export type CommandResult = { status: "done"; result: Record<string, unknown> } | { status: "failed"; error: string } | { status: "timeout" };

export async function awaitCommand(db: Db, id: string, timeoutMs: number): Promise<CommandResult> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const row = db.select().from(captureCommands).where(eq(captureCommands.id, id)).get();
    if (row?.status === "done") return { status: "done", result: JSON.parse(row.resultJson ?? "{}") };
    if (row?.status === "failed") return { status: "failed", error: row.error ?? "Failed" };
    await new Promise((r) => setTimeout(r, 100));
  }
  // Make sure a slow worker doesn't run it after we've given up.
  db.update(captureCommands)
    .set({ status: "failed", error: "Timed out", finishedAt: Date.now() })
    .where(and(eq(captureCommands.id, id), eq(captureCommands.status, "pending")))
    .run();
  return { status: "timeout" };
}

export function takePendingCommands(db: Db, now = Date.now()) {
  db.update(captureCommands)
    .set({ status: "failed", error: "Expired before the worker picked it up", finishedAt: now })
    .where(and(eq(captureCommands.status, "pending"), lt(captureCommands.createdAt, now - COMMAND_TTL_MS)))
    .run();
  return db.select().from(captureCommands).where(eq(captureCommands.status, "pending")).orderBy(captureCommands.createdAt).all();
}

export function finishCommand(db: Db, id: string, outcome: { result: Record<string, unknown> } | { error: string }): void {
  db.update(captureCommands)
    .set(
      "error" in outcome
        ? { status: "failed", error: outcome.error, finishedAt: Date.now() }
        : { status: "done", resultJson: JSON.stringify(outcome.result), finishedAt: Date.now() },
    )
    .where(and(eq(captureCommands.id, id), eq(captureCommands.status, "pending")))
    .run();
}
