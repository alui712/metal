import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { frames } from "@/server/db/schema";
import { managedPath } from "@/server/media/storage";
import { isFrameId } from "@/server/smartclip/actions";

/** Serves an analysis keyframe by id (resolved inside managed storage). */
export async function GET(_request: Request, ctx: RouteContext<"/api/frames/[id]">) {
  const { id } = await ctx.params;
  if (!isFrameId(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const f = getDb().select({ path: frames.path }).from(frames).where(eq(frames.id, id)).get();
  if (!f) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const data = fs.readFileSync(managedPath(f.path));
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return Response.json({ error: "Frame missing" }, { status: 404 });
  }
}
