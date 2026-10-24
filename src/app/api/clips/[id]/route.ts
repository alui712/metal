import { getDb } from "@/server/db/client";
import { jsonError, privileged } from "@/server/http";
import { applyClipAction, isSuggestionId, type ClipAction } from "@/server/smartclip/actions";

/** Accept (save as a real clip), dismiss, restore, retry, or adjust a suggestion. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/clips/[id]">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isSuggestionId(id)) return jsonError(404, "Not found.");
  const body = (await request.json().catch(() => null)) as Partial<{ action: string; startMs: number; endMs: number }> | null;
  let action: ClipAction;
  if (body?.action === "adjust") action = { action: "adjust", startMs: Number(body.startMs), endMs: Number(body.endMs) };
  else if (body?.action === "accept" || body?.action === "dismiss" || body?.action === "restore" || body?.action === "retry" || body?.action === "favorite" || body?.action === "unfavorite") action = { action: body.action };
  else return jsonError(400, "Unknown action.");
  const err = applyClipAction(getDb(), id, action);
  if (err === "not-found") return jsonError(404, "Not found.");
  if (err) return jsonError(400, err);
  return Response.json({ ok: true });
}
