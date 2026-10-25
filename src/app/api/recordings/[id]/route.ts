import fs from "node:fs";
import { judgeLocked } from "@/server/judge/demo";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { recordings } from "@/server/db/schema";
import { jsonError, sameOrigin } from "@/server/http";
import { isRecordingId, managedPath } from "@/server/media/storage";

/** Removes a recording from METAL: its row, jobs, and METAL's own copy. Never touches files outside managed storage. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/recordings/[id]">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isRecordingId(id)) return jsonError(404, "Not found");
  const locked = judgeLocked(getDb(), { recordings: [id] });
  if (locked) return locked;
  const deleted = getDb().delete(recordings).where(eq(recordings.id, id)).returning({ id: recordings.id }).get();
  if (!deleted) return jsonError(404, "Not found");
  fs.rmSync(managedPath(id), { recursive: true, force: true });
  return new Response(null, { status: 204 });
}
