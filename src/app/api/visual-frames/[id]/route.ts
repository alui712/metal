import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { visualFrames } from "@/server/db/schema";
import { managedPath } from "@/server/media/storage";

const isVisualFrameId = (id: string) => /^vfr_[a-f0-9]{16}$/.test(id);

/** Serves a Visual Recall frame (the evidence a visual match points at) by id. */
export async function GET(_request: Request, ctx: RouteContext<"/api/visual-frames/[id]">) {
  const { id } = await ctx.params;
  if (!isVisualFrameId(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const f = getDb().select({ path: visualFrames.path }).from(visualFrames).where(eq(visualFrames.id, id)).get();
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
