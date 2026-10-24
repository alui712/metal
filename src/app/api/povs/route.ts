import { z } from "zod";
import { getDb } from "@/server/db/client";
import { jsonError, privileged } from "@/server/http";
import { isRecordingId } from "@/server/media/storage";
import { confirmPovSync, groupView, pairPov, setPlayerName, setPovOffset, unpairPov } from "@/server/pov/povs";
import { mediaUrls } from "@/server/timemachine/media-urls";

const Rec = z.string().refine(isRecordingId);
const Offset = z.number().finite().min(-24 * 3_600_000).max(24 * 3_600_000);

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pair"), recordingId: Rec, otherId: Rec, offsetMs: Offset, source: z.enum(["clock", "audio", "manual"]), audioScore: z.number().min(-1).max(1).nullable().optional() }),
  z.object({ action: z.literal("offset"), recordingId: Rec, offsetMs: Offset }),
  z.object({ action: z.literal("confirm"), recordingId: Rec }),
  z.object({ action: z.literal("unpair"), recordingId: Rec }),
  z.object({ action: z.literal("name"), recordingId: Rec, name: z.string().max(80).nullable() }),
]);

/** User edits to POV pairing and sync. Responds with the affected group (or null when it dissolved). */
export async function POST(request: Request) {
  const denied = privileged(request);
  if (denied) return denied;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return jsonError(400, "Invalid request.");
  const db = getDb();
  const b = body.data;
  let res: { groupId: string | null } | { error: string; status: number };
  if (b.action === "pair") res = pairPov(db, b);
  else if (b.action === "offset") res = setPovOffset(db, b.recordingId, b.offsetMs);
  else if (b.action === "confirm") res = confirmPovSync(db, b.recordingId);
  else if (b.action === "unpair") res = unpairPov(db, b.recordingId);
  else res = setPlayerName(db, b.recordingId, b.name) ? { groupId: null } : { error: "Not found.", status: 404 };
  if ("error" in res) return jsonError(res.status, res.error);
  return Response.json({ groupId: res.groupId, group: res.groupId ? groupView(db, res.groupId, mediaUrls()) : null });
}
