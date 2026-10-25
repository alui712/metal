import fs from "node:fs";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { renderExports, storyProjects } from "@/server/db/schema";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { parseRange } from "@/server/media/range";
import { exportFile, isExportId } from "@/server/studio/render";
import { deleteExport, isStoryId } from "@/server/studio/stories";
import { judgeLocked } from "@/server/judge/demo";

// Serves a finished story export by id. The path is derived from the id inside
// the exports directory; nothing from the client names a file.

const notFound = () => Response.json({ error: "Not found" }, { status: 404 });

export async function GET(request: Request, ctx: RouteContext<"/api/exports/[id]">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isExportId(id)) return notFound();
  const row = getDb()
    .select({ status: renderExports.status, title: storyProjects.title })
    .from(renderExports)
    .innerJoin(storyProjects, eq(storyProjects.id, renderExports.projectId))
    .where(eq(renderExports.id, id))
    .get();
  if (row?.status !== "succeeded") return notFound();
  const file = exportFile(id);
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
    if (!stat.isFile()) return notFound();
  } catch {
    return notFound();
  }
  const download = new URL(request.url).searchParams.get("download") === "1";
  const name = `${row.title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "METAL story"}.mp4`;
  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": download ? `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}` : "inline",
    "Last-Modified": stat.mtime.toUTCString(),
  });
  const range = parseRange(request.headers.get("range"), stat.size);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${stat.size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range ?? { start: 0, end: stat.size - 1 };
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
  if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
  const stream = fs.createReadStream(file, { start, end });
  request.signal.addEventListener("abort", () => stream.destroy());
  return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/exports/[id]">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isExportId(id)) return notFound();
  const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
  if (!body || typeof body.projectId !== "string" || !isStoryId(body.projectId)) return jsonError(400, "Invalid export.");
  const locked = judgeLocked(getDb(), { exports: [id], stories: [body.projectId] });
  if (locked) return locked;
  const res = deleteExport(getDb(), id, body.projectId);
  return "error" in res ? jsonError(res.status, res.error) : new Response(null, { status: 204 });
}

export { GET as HEAD };
