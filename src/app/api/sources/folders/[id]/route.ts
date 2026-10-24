import { getDb } from "@/server/db/client";
import { jsonError, privileged } from "@/server/http";
import { removeFolder, updateFolder, type FolderAction } from "@/server/sources/folders";

const ACTIONS: FolderAction[] = ["pause", "resume", "rescan", "retry"];

export async function PATCH(request: Request, ctx: RouteContext<"/api/sources/folders/[id]">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (!ACTIONS.includes(body.action as FolderAction)) return jsonError(400, "Unknown action.");
  if (!updateFolder(getDb(), id, body.action as FolderAction)) return jsonError(404, "Folder not found.");
  return Response.json({ ok: true });
}

/** Stops watching. Never touches the folder or the recordings already imported. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/sources/folders/[id]">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!removeFolder(getDb(), id)) return jsonError(404, "Folder not found.");
  return Response.json({ ok: true });
}
