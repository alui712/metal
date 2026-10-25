import { eq } from "drizzle-orm";
import { judgeLocked } from "@/server/judge/demo";
import { getDb } from "@/server/db/client";
import { recordings } from "@/server/db/schema";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { getLiveWorker } from "@/server/jobs/queue";
import { isRecordingId } from "@/server/media/storage";
import { povView, requestPovMatch } from "@/server/pov/povs";
import { mediaUrls } from "@/server/timemachine/media-urls";

/** This recording's POV group, evidence-backed candidates, and the last "Find other POVs" run. */
export async function GET(request: Request, ctx: RouteContext<"/api/recordings/[id]/povs">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isRecordingId(id)) return jsonError(404, "Not found.");
  const db = getDb();
  const view = povView(db, id, mediaUrls());
  if (!view) return jsonError(404, "Not found.");
  return Response.json({ ...view, workerOnline: Boolean(getLiveWorker(db)) }, { headers: { "Cache-Control": "no-store" } });
}

/** "Find other POVs": measures shared audio against candidates, locally, in the worker. */
export async function POST(request: Request, ctx: RouteContext<"/api/recordings/[id]/povs">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isRecordingId(id)) return jsonError(404, "Not found.");
  const db = getDb();
  const rec = db.select({ status: recordings.status }).from(recordings).where(eq(recordings.id, id)).get();
  if (!rec) return jsonError(404, "Not found.");
  const locked = judgeLocked(db, { recordings: [id] });
  if (locked) return locked;
  if (rec.status !== "ready" && rec.status !== "analyzed") return jsonError(409, "Wait until the recording has finished processing.");
  const result = requestPovMatch(db, id);
  return Response.json({ result }, { status: result === "queued" ? 202 : 200 });
}
