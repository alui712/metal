import { z } from "zod";
import { getDb } from "@/server/db/client";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { isRecordingId } from "@/server/media/storage";
import { isSuggestionId } from "@/server/smartclip/actions";
import { createStory, listStories, MAX_STORY_CLIPS } from "@/server/studio/stories";
import { mediaUrls } from "@/server/timemachine/media-urls";
import { isSessionId } from "@/server/timemachine/sessions";

const Body = z
  .object({
    sessionId: z.string().refine(isSessionId).nullable(),
    momentIds: z.array(z.string().refine(isSuggestionId)).max(MAX_STORY_CLIPS).optional(),
    ranges: z
      .array(z.object({ recordingId: z.string().refine(isRecordingId), inMs: z.number().finite(), outMs: z.number().finite(), caption: z.string().max(200).nullable().optional() }))
      .max(MAX_STORY_CLIPS)
      .optional(),
    title: z.string().max(200).optional(),
  })
  .refine((b) => (b.momentIds?.length ?? 0) + (b.ranges?.length ?? 0) > 0);

export async function GET(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  return Response.json({ stories: listStories(getDb(), mediaUrls()) }, { headers: { "Cache-Control": "no-store" } });
}

/** Starts a story from real moments (Time Machine) or recording ranges (Recall). */
export async function POST(request: Request) {
  const denied = privileged(request);
  if (denied) return denied;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, `Pick 1–${MAX_STORY_CLIPS} moments.`);
  const res = createStory(getDb(), body.data);
  if ("error" in res) return jsonError(409, res.error);
  return Response.json(res, { status: 201 });
}
