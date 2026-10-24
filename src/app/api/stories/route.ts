import { z } from "zod";
import { getDb } from "@/server/db/client";
import { jsonError, privileged } from "@/server/http";
import { isSuggestionId } from "@/server/smartclip/actions";
import { isSessionId } from "@/server/timemachine/sessions";
import { createStory, MAX_STORY_CLIPS } from "@/server/timemachine/stories";

const Body = z.object({
  sessionId: z.string().refine(isSessionId).nullable(),
  momentIds: z.array(z.string().refine(isSuggestionId)).min(1).max(MAX_STORY_CLIPS),
  title: z.string().max(200).optional(),
});

/** Starts a Story Studio project from real moments (ids + their own boundaries). */
export async function POST(request: Request) {
  const denied = privileged(request);
  if (denied) return denied;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, `Pick 1–${MAX_STORY_CLIPS} moments.`);
  const res = createStory(getDb(), body.data);
  if ("error" in res) return jsonError(409, res.error);
  return Response.json(res, { status: 201 });
}
