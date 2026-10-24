import { publicObsConfig, readObsConfig } from "@/server/capture/config";
import { captureView } from "@/server/capture/state";
import { getDb } from "@/server/db/client";
import { jsonError, sameOrigin } from "@/server/http";
import { readRecordings } from "@/server/recordings";

/** Live capture state for polling. No credentials, no file paths. */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const db = getDb();
  const state = captureView(db);
  const clipId = state.lastClip?.recordingId;
  return Response.json(
    {
      state,
      config: publicObsConfig(readObsConfig()),
      lastClipRecording: clipId ? (readRecordings([clipId])[0] ?? null) : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
