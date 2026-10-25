import { z } from "zod";
import { getDb } from "@/server/db/client";
import { isJudge, scopeStory } from "@/lib/judge/scope";
import { judgeScope } from "@/server/judge/demo";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { isRecordingId } from "@/server/media/storage";
import { deleteStory, isStoryId, MAX_STORY_CLIPS, renameStory, saveStory, storyView } from "@/server/studio/stories";
import { mediaUrls } from "@/server/timemachine/media-urls";

const Save = z.object({
  title: z.string().max(80),
  aspect: z.enum(["16:9", "9:16", "1:1"]),
  framing: z.enum(["fill", "fit"]),
  captions: z.boolean(),
  clips: z
    .array(
      z.object({
        recordingId: z.string().refine(isRecordingId),
        suggestionId: z.string().regex(/^clp_[a-f0-9]{16}$/).nullable(),
        inMs: z.number().int().nonnegative(),
        outMs: z.number().int().positive(),
        caption: z.string().max(200).nullable(),
      }),
    )
    .max(MAX_STORY_CLIPS),
});

const Rename = z.object({ title: z.string().max(80) });

export async function GET(request: Request, ctx: RouteContext<"/api/stories/[id]">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  const db = getDb();
  const v = storyView(db, id, mediaUrls());
  if (!v) return jsonError(404, "Not found.");
  if (isJudge(new URL(request.url).searchParams.get("judge"))) {
    // Guided demo: only the approved story, and only approved recordings as candidates.
    const scope = judgeScope(db);
    if (scope.demo.story?.id !== id) return jsonError(403, "This story isn’t part of the prepared demo.");
    return Response.json(scopeStory(v, scope.allowed, scope.demo.nightId), { headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(v, { headers: { "Cache-Control": "no-store" } });
}

/** Saves the whole edit list (the editor autosaves). */
export async function PUT(request: Request, ctx: RouteContext<"/api/stories/[id]">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  const body = Save.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Invalid story.");
  const res = saveStory(getDb(), id, body.data);
  return "error" in res ? jsonError(res.status, res.error) : Response.json(res);
}

/** Renames a project without replacing its edit list. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/stories/[id]">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  const body = Rename.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Invalid title.");
  const res = renameStory(getDb(), id, body.data.title);
  return "error" in res ? jsonError(res.status, res.error) : Response.json(res);
}

/** Deletes the project and only its finished/failed export artifacts. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/stories/[id]">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isStoryId(id)) return jsonError(404, "Not found.");
  const res = deleteStory(getDb(), id);
  return "error" in res ? jsonError(res.status, res.error) : new Response(null, { status: 204 });
}
