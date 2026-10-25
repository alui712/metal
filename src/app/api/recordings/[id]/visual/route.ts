import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { recordings } from "@/server/db/schema";
import { judgeLocked } from "@/server/judge/demo";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { isRecordingId } from "@/server/media/storage";
import { visualModelStatus } from "@/server/visual/clip";
import { requestVisualIndex, visualIndexView } from "@/server/visual/indexer";

/** Visual index status for one recording (no paths). */
export async function GET(request: Request, ctx: RouteContext<"/api/recordings/[id]/visual">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isRecordingId(id)) return jsonError(404, "Not found.");
  const db = getDb();
  if (!db.select({ id: recordings.id }).from(recordings).where(eq(recordings.id, id)).get()) return jsonError(404, "Not found.");
  return Response.json(visualIndexView(db, id), { headers: { "Cache-Control": "no-store" } });
}

/** Starts local visual indexing. Explicit user action only; `?force=1` re-indexes a current index. */
export async function POST(request: Request, ctx: RouteContext<"/api/recordings/[id]/visual">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isRecordingId(id)) return jsonError(404, "Not found.");
  const db = getDb();
  const rec = db.select({ status: recordings.status }).from(recordings).where(eq(recordings.id, id)).get();
  if (!rec) return jsonError(404, "Not found.");
  // Approved judge-demo recordings stay as prepared (423), like transcription.
  const locked = judgeLocked(db, { recordings: [id] });
  if (locked) return locked;
  if (rec.status !== "ready" && rec.status !== "analyzed") return jsonError(409, "Wait until the recording has finished processing.");
  const s = visualModelStatus();
  if (!s.available) return jsonError(409, s.reason);
  const result = requestVisualIndex(db, id, { force: new URL(request.url).searchParams.get("force") === "1" });
  return Response.json({ result }, { status: result === "queued" ? 202 : 200 });
}
