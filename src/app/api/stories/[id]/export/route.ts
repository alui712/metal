import { getDb } from "@/server/db/client";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { exportsFor, isStoryId, requestExport } from "@/server/studio/stories";

/** Recent exports of this story, with live job status. */
export async function GET(request: Request, ctx: RouteContext<"/api/stories/[id]/export">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  return Response.json({ exports: exportsFor(getDb(), id) }, { headers: { "Cache-Control": "no-store" } });
}

/** Queues a render of the saved story (one at a time per story). */
export async function POST(request: Request, ctx: RouteContext<"/api/stories/[id]/export">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  const res = requestExport(getDb(), id);
  return "error" in res ? jsonError(res.status, res.error) : Response.json(res, { status: 202 });
}
