import { awaitCommand, CAPTURE_ACTIONS, captureView, enqueueCommand, type CaptureAction } from "@/server/capture/state";
import { getDb } from "@/server/db/client";
import { jsonError, privileged } from "@/server/http";

/** Asks the worker to run an OBS action and waits for OBS's answer. */
export async function POST(request: Request) {
  const denied = privileged(request);
  if (denied) return denied;
  let body: { action?: unknown; replaySeconds?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid request.");
  }
  const action = body.action as CaptureAction;
  if (!CAPTURE_ACTIONS.includes(action)) return jsonError(400, "Unknown action.");

  const db = getDb();
  const state = captureView(db);
  if (!state.workerOnline) return jsonError(503, "The background worker isn’t running, so METAL can’t reach OBS. Start it with npm run worker.");
  if (state.connection !== "connected") return jsonError(409, "METAL isn’t connected to OBS.");

  const payload = action === "start-replay" && typeof body.replaySeconds === "number" ? { replaySeconds: body.replaySeconds } : {};
  const id = enqueueCommand(db, action, payload);
  const outcome = await awaitCommand(db, id, action === "save-replay" ? 20_000 : 12_000);
  if (outcome.status === "timeout") return jsonError(504, "OBS didn’t respond in time.");
  if (outcome.status === "failed") return jsonError(502, outcome.error);
  // No state snapshot here: OBS applies some changes asynchronously; clients poll /api/capture.
  return Response.json({ ok: true, result: outcome.result });
}
