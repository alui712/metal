import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { recordings } from "@/server/db/schema";
import { parseRange } from "@/server/media/range";
import { isRecordingId, managedPath, MEDIA_TYPES, isMediaExt } from "@/server/media/storage";

// Streams managed media by recording id. The client never names a path:
// the id selects a row, and the row's stored relative path is resolved
// inside managed storage.

const notFound = (message = "Not found") => Response.json({ error: message }, { status: 404 });

export async function GET(request: Request, ctx: RouteContext<"/api/media/[id]/[variant]">) {
  const { id, variant } = await ctx.params;
  if (!isRecordingId(id) || (variant !== "video" && variant !== "poster")) return notFound();

  const r = getDb().select().from(recordings).where(eq(recordings.id, id)).get();
  if (!r) return notFound();
  const rel =
    variant === "poster"
      ? r.posterPath
      : r.status === "ready" || r.status === "analyzed"
        ? (r.proxyPath ?? r.originalPath)
        : null;
  if (!rel) return notFound(variant === "video" ? "Not ready yet" : "No thumbnail");

  let file: string;
  let stat: fs.Stats;
  try {
    file = managedPath(rel);
    stat = fs.lstatSync(file);
    if (!stat.isFile()) return notFound("Media file missing");
  } catch {
    return notFound("Media file missing");
  }

  const ext = path.extname(file).slice(1);
  const type = variant === "poster" ? "image/jpeg" : isMediaExt(ext) ? MEDIA_TYPES[ext] : "application/octet-stream";
  const headers = new Headers({
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
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

export { GET as HEAD };
