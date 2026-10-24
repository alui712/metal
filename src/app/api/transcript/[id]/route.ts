import { z } from "zod";
import { getDb } from "@/server/db/client";
import { jsonError, privileged } from "@/server/http";
import { flagSegment, isSegmentId } from "@/server/search/recall";

const Body = z.object({ flagged: z.boolean() });

/** Marks a transcript line as wrong (excluded from search and Smart Clip), or restores it. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/transcript/[id]">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isSegmentId(id)) return jsonError(404, "Not found.");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Send { flagged: true | false }.");
  if (!flagSegment(getDb(), id, body.data.flagged)) return jsonError(404, "Not found.");
  return Response.json({ ok: true });
}
