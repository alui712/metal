import { getDb } from "@/server/db/client";
import { isJudge } from "@/lib/judge/scope";
import { judgeLocked, judgeScope } from "@/server/judge/demo";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { exportsFor, isStoryId, requestExport } from "@/server/studio/stories";

/** Recent exports of this story, with live job status. */
export async function GET(request: Request, ctx: RouteContext<"/api/stories/[id]/export">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  const db = getDb();
  let list = exportsFor(db, id);
  if (isJudge(new URL(request.url).searchParams.get("judge"))) {
    // Guided demo: the approved story's approved exports only.
    const story = judgeScope(db).demo.story;
    if (story?.id !== id) return jsonError(403, "This story isn’t part of the prepared demo.");
    list = list.filter((e) => story.exports.includes(e.id));
  }
  return Response.json({ exports: list }, { headers: { "Cache-Control": "no-store" } });
}

/** Queues a render of the saved story (one at a time per story). */
export async function POST(request: Request, ctx: RouteContext<"/api/stories/[id]/export">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  const locked = judgeLocked(getDb(), { stories: [id] });
  if (locked) return locked;
  const res = requestExport(getDb(), id);
  return "error" in res ? jsonError(res.status, res.error) : Response.json(res, { status: 202 });
}
