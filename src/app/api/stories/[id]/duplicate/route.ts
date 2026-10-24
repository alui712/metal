import { getDb } from "@/server/db/client";
import { jsonError, privileged } from "@/server/http";
import { duplicateStory, isStoryId } from "@/server/studio/stories";

/** Copies the saved project and clips. Export history stays with the original. */
export async function POST(request: Request, ctx: RouteContext<"/api/stories/[id]/duplicate">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  const res = duplicateStory(getDb(), id);
  return "error" in res ? jsonError(res.status, res.error) : Response.json(res, { status: 201 });
}
