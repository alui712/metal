import { z } from "zod";
import { getDb } from "@/server/db/client";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { isRecordingId } from "@/server/media/storage";
import { mediaUrls } from "@/server/timemachine/media-urls";
import { editSession, isSessionId, sessionDetail, type SessionEdit } from "@/server/timemachine/sessions";

const rec = z.string().refine(isRecordingId);
const target = z.union([z.literal("new"), z.null(), z.string().refine(isSessionId)]);
const Edit = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), title: z.string().max(200).nullable() }),
  z.object({ action: z.literal("move"), recordingId: rec, to: target }),
  z.object({ action: z.literal("merge"), into: z.string().refine(isSessionId) }),
  z.object({ action: z.literal("split"), atRecordingId: rec }),
  z.object({ action: z.literal("reset") }),
]);

export async function GET(request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isSessionId(id)) return jsonError(404, "Not found.");
  const d = sessionDetail(getDb(), id, mediaUrls());
  return d ? Response.json(d, { headers: { "Cache-Control": "no-store" } }) : jsonError(404, "Not found.");
}

/** Grouping edits. `id` may be "none" to place a recording that isn't in any session. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (id !== "none" && !isSessionId(id)) return jsonError(404, "Not found.");
  const body = Edit.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Invalid edit.");
  if (id === "none" && body.data.action !== "move") return jsonError(400, "Invalid edit.");
  const err = editSession(getDb(), id, body.data as SessionEdit);
  if (err === "not-found") return jsonError(404, "Not found.");
  if (err) return jsonError(409, err);
  return Response.json({ ok: true });
}
