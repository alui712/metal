import { eq } from "drizzle-orm";
import { speechProvider } from "@/server/analysis/providers";
import { requestTranscription, transcriptView } from "@/server/analysis/transcribe";
import { getDb } from "@/server/db/client";
import { recordings } from "@/server/db/schema";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { isRecordingId } from "@/server/media/storage";

/** Transcript status and segments for one recording (no paths). */
export async function GET(request: Request, ctx: RouteContext<"/api/recordings/[id]/transcript">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isRecordingId(id)) return jsonError(404, "Not found.");
  const db = getDb();
  if (!db.select({ id: recordings.id }).from(recordings).where(eq(recordings.id, id)).get()) return jsonError(404, "Not found.");
  return Response.json(transcriptView(db, id), { headers: { "Cache-Control": "no-store" } });
}

/** Starts (or re-runs) local transcription. Explicit user action only. */
export async function POST(request: Request, ctx: RouteContext<"/api/recordings/[id]/transcript">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isRecordingId(id)) return jsonError(404, "Not found.");
  const db = getDb();
  const rec = db.select({ status: recordings.status }).from(recordings).where(eq(recordings.id, id)).get();
  if (!rec) return jsonError(404, "Not found.");
  if (rec.status !== "ready" && rec.status !== "analyzed") return jsonError(409, "Wait until the recording has finished processing.");
  const p = speechProvider();
  if (!p.available) return jsonError(409, p.reason);
  const result = requestTranscription(db, id);
  return Response.json({ result }, { status: result === "queued" ? 202 : 200 });
}
