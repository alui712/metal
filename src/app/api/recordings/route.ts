import { getDb } from "@/server/db/client";
import { getLiveWorker } from "@/server/jobs/queue";
import { receiveUpload, UploadError } from "@/server/media/upload";
import { isRecordingId } from "@/server/media/storage";
import { readRecordings } from "@/server/recordings";
import { jsonError, sameOrigin } from "@/server/http";

// Local-only API: the custom upload header forces a CORS preflight, and
// sameOrigin() refuses requests whose Origin doesn't match Host.

const error = jsonError;

/** Upload one video as the raw request body. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return error(403, "Cross-origin uploads are not allowed.");
  const rawName = request.headers.get("x-metal-filename");
  if (!rawName || !request.body) return error(400, "Missing file.");
  let filename: string;
  try {
    filename = decodeURIComponent(rawName);
  } catch {
    return error(400, "Invalid filename.");
  }
  const lastModified = Number(request.headers.get("x-metal-last-modified")) || null;
  try {
    const result = await receiveUpload(getDb(), { body: request.body, filename, lastModified });
    const [recording] = readRecordings([result.id]);
    return Response.json({ duplicate: result.duplicate, recording }, { status: result.duplicate ? 200 : 201 });
  } catch (err) {
    if (err instanceof UploadError) return error(err.status, err.message);
    console.error("[upload]", err);
    return error(500, "The upload couldn’t be saved.");
  }
}

/** Status for polling: `?ids=rec_a,rec_b` (or all recordings). */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return error(403, "Forbidden.");
  const param = new URL(request.url).searchParams.get("ids");
  const ids = param?.split(",").filter(isRecordingId).slice(0, 100);
  return Response.json({
    workerOnline: Boolean(getLiveWorker(getDb())),
    recordings: readRecordings(ids),
  });
}
