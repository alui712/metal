import { z } from "zod";
import { getDb } from "@/server/db/client";
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
  const v = storyView(getDb(), id, mediaUrls());
  return v ? Response.json(v, { headers: { "Cache-Control": "no-store" } }) : jsonError(404, "Not found.");
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
