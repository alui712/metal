import { eq } from "drizzle-orm";
import { canonicalGame, catalogGame, genreLabels } from "@/lib/games/catalog";
import { getDb } from "@/server/db/client";
import { recordings } from "@/server/db/schema";
import { judgeLocked } from "@/server/judge/demo";
import { jsonError, privileged, sameOrigin } from "@/server/http";
import { isRecordingId } from "@/server/media/storage";
import { lockSession } from "@/server/timemachine/sessions";

// The game a person set on a recording. Recall finds recordings by game and genre only through this.
const view = (game: string | null) => {
  const entry = catalogGame(game);
  return { game, known: !!entry, genres: entry ? genreLabels(entry.genres) : [] };
};

export async function GET(request: Request, ctx: RouteContext<"/api/recordings/[id]/game">) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const { id } = await ctx.params;
  if (!isRecordingId(id)) return jsonError(404, "Not found.");
  const rec = getDb().select({ game: recordings.game }).from(recordings).where(eq(recordings.id, id)).get();
  if (!rec) return jsonError(404, "Not found.");
  return Response.json(view(rec.game), { headers: { "Cache-Control": "no-store" } });
}

/** Sets (or clears, with null or "") the game. Explicit user action only. */
export async function PUT(request: Request, ctx: RouteContext<"/api/recordings/[id]/game">) {
  const denied = privileged(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!isRecordingId(id)) return jsonError(404, "Not found.");
  const body = (await request.json().catch(() => null)) as { game?: unknown } | null;
  if (!body || (body.game !== null && typeof body.game !== "string")) return jsonError(400, "Send { game: string | null }.");
  const db = getDb();
  const rec = db.select({ game: recordings.game, sessionId: recordings.sessionId }).from(recordings).where(eq(recordings.id, id)).get();
  if (!rec) return jsonError(404, "Not found.");
  // Approved judge-demo recordings, and recordings in the approved night, stay as prepared (423).
  const locked = judgeLocked(db, { recordings: [id], sessions: [rec.sessionId] });
  if (locked) return locked;
  const game = typeof body.game === "string" ? canonicalGame(body.game) : null;
  if (game === rec.game) return Response.json(view(game));
  db.$client
    .transaction(() => {
      // Time Machine starts a new session when the known game changes; setting a game must not
      // regroup a night the person already sees, so its session keeps its current grouping.
      if (rec.sessionId) lockSession(db, rec.sessionId);
      db.update(recordings).set({ game }).where(eq(recordings.id, id)).run();
    })
    .immediate();
  return Response.json(view(game));
}
