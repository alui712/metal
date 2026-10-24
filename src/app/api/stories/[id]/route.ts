import { getDb } from "@/server/db/client";
import { jsonError, sameOrigin } from "@/server/http";
import { mediaUrls } from "@/server/timemachine/media-urls";
import { isStoryId, storyView } from "@/server/timemachine/stories";

export async function GET(request: Request, ctx: RouteContext<"/api/stories/[id]">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  const v = storyView(getDb(), id, mediaUrls());
  return v ? Response.json(v, { headers: { "Cache-Control": "no-store" } }) : jsonError(404, "Not found.");
}
