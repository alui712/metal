import { getDb } from "@/server/db/client";
import { jsonError, sameOrigin } from "@/server/http";
import { groupView, isPovGroupId } from "@/server/pov/povs";
import { mediaUrls } from "@/server/timemachine/media-urls";

export async function GET(request: Request, ctx: RouteContext<"/api/povs/[id]">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  const group = isPovGroupId(id) ? groupView(getDb(), id, mediaUrls()) : null;
  if (!group) return jsonError(404, "Not found.");
  return Response.json({ group }, { headers: { "Cache-Control": "no-store" } });
}
