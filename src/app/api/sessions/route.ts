import { getDb } from "@/server/db/client";
import { judgeLocked } from "@/server/judge/demo";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { mediaUrls } from "@/server/timemachine/media-urls";
import { setGapMinutes, timeMachineOverview } from "@/server/timemachine/sessions";

/** Real sessions, plus recordings without a known time or session. */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  return Response.json(timeMachineOverview(getDb(), mediaUrls()), { headers: { "Cache-Control": "no-store" } });
}

/** Settings: { gapMinutes }. */
export async function PATCH(request: Request) {
  const denied = privileged(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { gapMinutes?: unknown } | null;
  // Regrouping every session can change the approved night.
  const locked = judgeLocked(getDb(), { regroup: true });
  if (locked) return locked;
  if (!setGapMinutes(getDb(), Number(body?.gapMinutes))) return jsonError(400, "Unsupported gap.");
  return Response.json({ ok: true });
}
