import { isNotNull } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { recordings, transcriptSegments } from "@/server/db/schema";
import { jsonError, sameOrigin } from "@/server/http";
import { isRecordingId } from "@/server/media/storage";
import { readRecordings } from "@/server/recordings";
import { ensureEmbeddings, recallIndexStats, searchRecall, type RecallFilters } from "@/server/search/recall";
import { isJudge, judgeRecallScope } from "@/lib/judge/scope";
import { judgeScope } from "@/server/judge/demo";

const day = (v: string | null, end = false) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (end) d.setDate(d.getDate() + 1);
  return d.getTime();
};

/**
 * Recall over the real library: transcript lines and recording names.
 * Local only (FTS5 + on-device embeddings); no paths in the response.
 */
export async function GET(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 200);
  const rec = url.searchParams.get("recording");
  const game = url.searchParams.get("game")?.slice(0, 80) || undefined;
  const filters: RecallFilters = {
    recordingId: rec && isRecordingId(rec) ? rec : undefined,
    game,
    fromMs: day(url.searchParams.get("from")),
    toMs: day(url.searchParams.get("to"), true),
  };
  const db = getDb();
  // Judge mode (?judge=1, added by the guided demo): only the prepared recording, no other filters.
  const judge = isJudge(url.searchParams.get("judge")) ? judgeScope(db) : null;
  if (judge) {
    const scoped = judgeRecallScope(url.searchParams, judge.demo.recall?.recordingId ?? null, judge.allowed);
    if ("error" in scoped) return jsonError(400, scoped.error);
    filters.recordingId = scoped.recordingId;
    filters.game = filters.fromMs = filters.toMs = undefined;
  }
  const label = new Map(judge?.demo.recordings.map((r) => [r.id, r.label]) ?? []);
  // Lines transcribed before embeddings existed get vectors on first search.
  await ensureEmbeddings(db).catch(() => 0);
  const search = await searchRecall(db, q, filters);
  const recs = new Map(readRecordings([...new Set(search.results.map((r) => r.recordingId))]).map((r) => [r.id, r]));
  const transcribed = new Set(db.selectDistinct({ id: transcriptSegments.recordingId }).from(transcriptSegments).all().map((r) => r.id));
  const gameOf = new Map(db.select({ id: recordings.id, game: recordings.game }).from(recordings).where(isNotNull(recordings.game)).all().map((g) => [g.id, g.game]));
  const games = db.selectDistinct({ game: recordings.game }).from(recordings).where(isNotNull(recordings.game)).all().flatMap((g) => (g.game ? [g.game] : []));
  return Response.json(
    {
      ...search,
      results: search.results.flatMap((h) => {
        const r = recs.get(h.recordingId);
        if (judge && !judge.allowed.has(h.recordingId)) return [];
        return r ? [{ ...h, recording: { id: r.id, title: label.get(r.id) ?? r.title, game: gameOf.get(r.id) ?? null, recordedAt: r.recordedAt ?? r.importedAt, durationMs: r.durationMs, posterUrl: r.posterUrl, videoUrl: r.videoUrl, origin: r.origin } }] : [];
      }),
      index: recallIndexStats(db),
      facets: judge
        ? { games: [], recordings: readRecordings([filters.recordingId!]).map((r) => ({ id: r.id, title: label.get(r.id) ?? r.title })) }
        : {
            games,
            recordings: readRecordings()
              .filter((r) => transcribed.has(r.id))
              .map((r) => ({ id: r.id, title: r.title })),
          },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
