import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { appSettings, clipSuggestions, recordingAnalysis, recordings, recordingTranscripts, sessions, transcriptSegments } from "../db/schema";
import { newId } from "../ids";
import { APPROXIMATE_SOURCES, resolveRecordedAt } from "../media/recorded-time";
import { listSuggestions } from "../smartclip/actions";
import { GAP_CHOICES, type SessionDetail, type SessionSummary, type TimelineMoment, type TimelineRecording, type TimeMachineOverview } from "@/lib/timemachine/types";

// Real sessions: recordings grouped by when they were actually recorded
// (never import time), the game when known, and a configurable gap. User
// edits lock the sessions they touch, so automatic regrouping never undoes them.

export const DEFAULT_GAP_MINUTES = 45;
const GAP_KEY = "timeMachine.gapMinutes";

export function getGapMinutes(db: Db): number {
  const v = Number(db.select().from(appSettings).where(eq(appSettings.key, GAP_KEY)).get()?.value);
  return (GAP_CHOICES as readonly number[]).includes(v) ? v : DEFAULT_GAP_MINUTES;
}

export function setGapMinutes(db: Db, minutes: number): boolean {
  if (!(GAP_CHOICES as readonly number[]).includes(minutes)) return false;
  db.insert(appSettings).values({ key: GAP_KEY, value: String(minutes) }).onConflictDoUpdate({ target: appSettings.key, set: { value: String(minutes) } }).run();
  syncSessions(db);
  return true;
}

export type ClusterItem = { id: string; startMs: number; endMs: number; game: string | null };

/** Chronological groups: a new session starts after a gap longer than `gapMs`, or when the (known) game changes. */
export function clusterRecordings(items: ClusterItem[], gapMs: number): ClusterItem[][] {
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  const out: ClusterItem[][] = [];
  let end = -Infinity;
  let game: string | null = null;
  for (const it of sorted) {
    const cur = out.at(-1);
    const gameChange = Boolean(cur && it.game && game && it.game !== game);
    if (!cur || it.startMs - end > gapMs || gameChange) {
      out.push([it]);
      end = it.endMs;
      game = it.game;
    } else {
      cur.push(it);
      end = Math.max(end, it.endMs);
      game ??= it.game;
    }
  }
  return out;
}

const PLAYABLE = ["ready", "analyzed"] as const;

/** Applies file-name timestamps to recordings imported before they were read. */
function backfillTimes(db: Db) {
  const rows = db
    .select({ id: recordings.id, filename: recordings.originalFilename, durationMs: recordings.durationMs, at: recordings.recordedAt, source: recordings.recordedAtSource })
    .from(recordings)
    .where(and(ne(recordings.origin, "clip"), sql`coalesce(${recordings.recordedAtSource}, '') not in ('filename', 'manual', 'parent')`))
    .all();
  for (const r of rows) {
    const t = resolveRecordedAt({ filename: r.filename, durationMs: r.durationMs, metadataMs: null, current: { at: r.at, source: r.source } });
    if (t.source === "filename" && (t.at !== r.at || r.source !== "filename")) db.update(recordings).set({ recordedAt: t.at, recordedAtSource: "filename" }).where(eq(recordings.id, r.id)).run();
  }
}

/** Recomputes automatic sessions. Idempotent; locked recordings and sessions are kept as the user left them. */
export function syncSessions(db: Db): void {
  // IMMEDIATE: this reads then writes; a deferred transaction can't upgrade while the worker writes.
  db.$client.transaction(() => {
    backfillTimes(db);
    const gapMs = getGapMinutes(db) * 60_000;
    const recs = db
      .select({ id: recordings.id, at: recordings.recordedAt, dur: recordings.durationMs, game: recordings.game, sessionId: recordings.sessionId, locked: recordings.sessionLocked })
      .from(recordings)
      .where(and(ne(recordings.origin, "clip"), inArray(recordings.status, [...PLAYABLE])))
      .all();
    const existing = new Map(db.select().from(sessions).all().map((s) => [s.id, s]));
    const free = recs.filter((r) => !r.locked);
    const assign = new Map<string, string | null>();
    for (const r of free) if (r.at === null) assign.set(r.id, null);

    const used = new Set([...existing.values()].filter((s) => s.locked).map((s) => s.id));
    const groups = clusterRecordings(
      free.filter((r) => r.at !== null).map((r) => ({ id: r.id, startMs: r.at!, endMs: r.at! + (r.dur ?? 0), game: r.game })),
      gapMs,
    );
    for (const g of groups) {
      // Keep a stable id: the session most members already belong to (if automatic), else one derived from the first recording.
      const votes = new Map<string, number>();
      for (const it of g) {
        const sid = free.find((r) => r.id === it.id)?.sessionId;
        if (sid && existing.get(sid) && !existing.get(sid)!.locked && !used.has(sid)) votes.set(sid, (votes.get(sid) ?? 0) + 1);
      }
      let id = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? `ses_${g[0].id.slice(4)}`;
      if (used.has(id)) id = newId("ses");
      used.add(id);
      const games = [...new Set(g.map((x) => x.game).filter(Boolean))];
      const range = { startedAt: Math.min(...g.map((x) => x.startMs)), endedAt: Math.max(...g.map((x) => x.endMs)), game: games.length === 1 ? games[0] : null };
      const prev = existing.get(id);
      if (!prev || prev.startedAt !== range.startedAt || prev.endedAt !== range.endedAt || prev.game !== range.game)
        db.insert(sessions).values({ id, ...range }).onConflictDoUpdate({ target: sessions.id, set: range }).run();
      for (const it of g) assign.set(it.id, id);
    }
    const current = new Map(free.map((r) => [r.id, r.sessionId]));
    for (const [rid, sid] of assign) if (current.get(rid) !== sid) db.update(recordings).set({ sessionId: sid }).where(eq(recordings.id, rid)).run();

    // Locked sessions: refresh their time range from their (dated) members.
    for (const s of existing.values()) {
      if (!s.locked) continue;
      const members = recs.filter((r) => r.sessionId === s.id && r.at !== null);
      const startedAt = Math.min(...members.map((m) => m.at!));
      const endedAt = Math.max(...members.map((m) => m.at! + (m.dur ?? 0)));
      if (members.length && (startedAt !== s.startedAt || endedAt !== s.endedAt)) {
        db.update(sessions)
          .set({ startedAt, endedAt })
          .where(eq(sessions.id, s.id))
          .run();
      }
    }
    // Sessions left without recordings go away.
    const live = new Set(db.select({ id: recordings.sessionId }).from(recordings).where(isNotNull(recordings.sessionId)).all().map((r) => r.id));
    for (const s of db.select({ id: sessions.id }).from(sessions).all()) if (!live.has(s.id)) db.delete(sessions).where(eq(sessions.id, s.id)).run();
  }).immediate();
}

// ── Edits (each locks what it touches) ──────────────────────

function lockSession(db: Db, id: string) {
  db.update(sessions).set({ locked: true }).where(eq(sessions.id, id)).run();
  db.update(recordings).set({ sessionLocked: true }).where(eq(recordings.sessionId, id)).run();
}

function newSessionFor(db: Db, recordingId: string): string {
  const r = db.select({ at: recordings.recordedAt, dur: recordings.durationMs, game: recordings.game }).from(recordings).where(eq(recordings.id, recordingId)).get();
  const id = newId("ses");
  const at = r?.at ?? Date.now();
  db.insert(sessions).values({ id, locked: true, startedAt: at, endedAt: at + (r?.dur ?? 0), game: r?.game ?? null }).run();
  return id;
}

export type SessionEdit =
  | { action: "rename"; title: string | null }
  | { action: "move"; recordingId: string; to: string | "new" | null }
  | { action: "merge"; into: string }
  | { action: "split"; atRecordingId: string }
  | { action: "reset" };

/** Applies a grouping edit. Returns an error message, or null. `sessionId` may be "none" for moving a recording out of no session. */
export function editSession(db: Db, sessionId: string, e: SessionEdit): string | null {
  const s = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!s && !(e.action === "move" && sessionId === "none")) return "not-found";
  let err: string | null = null;
  db.$client.transaction(() => {
    switch (e.action) {
      case "rename": {
        const title = e.title?.trim().slice(0, 80) || null;
        db.update(sessions).set({ title }).where(eq(sessions.id, sessionId)).run();
        lockSession(db, sessionId);
        break;
      }
      case "move": {
        const r = db.select({ sessionId: recordings.sessionId, origin: recordings.origin }).from(recordings).where(eq(recordings.id, e.recordingId)).get();
        if (!r || r.origin === "clip" || (sessionId !== "none" && r.sessionId !== sessionId)) {
          err = "That recording isn’t in this session.";
          return;
        }
        if (e.to && e.to !== "new" && !db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, e.to)).get()) {
          err = "That session no longer exists.";
          return;
        }
        if (r.sessionId) lockSession(db, r.sessionId);
        const to = e.to === "new" ? newSessionFor(db, e.recordingId) : e.to;
        db.update(recordings).set({ sessionId: to, sessionLocked: true }).where(eq(recordings.id, e.recordingId)).run();
        if (to) lockSession(db, to);
        break;
      }
      case "merge": {
        if (e.into === sessionId || !db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, e.into)).get()) {
          err = "Choose another session to merge into.";
          return;
        }
        db.update(recordings).set({ sessionId: e.into, sessionLocked: true }).where(eq(recordings.sessionId, sessionId)).run();
        lockSession(db, e.into);
        if (s!.title && !db.select({ t: sessions.title }).from(sessions).where(eq(sessions.id, e.into)).get()?.t) db.update(sessions).set({ title: s!.title }).where(eq(sessions.id, e.into)).run();
        db.delete(sessions).where(eq(sessions.id, sessionId)).run();
        break;
      }
      case "split": {
        const members = db
          .select({ id: recordings.id, at: recordings.recordedAt })
          .from(recordings)
          .where(eq(recordings.sessionId, sessionId))
          .orderBy(sql`${recordings.recordedAt} is null`, asc(recordings.recordedAt), asc(recordings.id))
          .all();
        const i = members.findIndex((m) => m.id === e.atRecordingId);
        if (i <= 0) {
          err = "Split at a recording after the first one.";
          return;
        }
        lockSession(db, sessionId);
        const id = newSessionFor(db, members[i].id);
        db.update(recordings).set({ sessionId: id, sessionLocked: true }).where(inArray(recordings.id, members.slice(i).map((m) => m.id))).run();
        break;
      }
      case "reset": {
        db.update(sessions).set({ locked: false, title: null }).where(eq(sessions.id, sessionId)).run();
        db.update(recordings).set({ sessionLocked: false }).where(eq(recordings.sessionId, sessionId)).run();
        break;
      }
    }
  }).immediate();
  if (err) return err;
  syncSessions(db);
  return null;
}

// ── Views ───────────────────────────────────────────────────

export type MediaUrls = Map<string, { posterUrl: string | null; videoUrl: string | null }>;

const PART = (h: number) => (h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night");

/** Factual title from the start time ("Friday night"); after midnight still counts as the previous night. */
export const UNDATED_TITLE = "Session with unknown dates";

/** A session's display title: the user's, else the day and time — or a plain label when no time is known. */
export function sessionTitle(db: Db, s: { id: string; title: string | null; startedAt: number; game: string | null }): string {
  if (s.title) return s.title;
  const dated = db.select({ id: recordings.id }).from(recordings).where(and(eq(recordings.sessionId, s.id), isNotNull(recordings.recordedAt))).get();
  return dated ? derivedTitle(s.startedAt, s.game) : UNDATED_TITLE;
}

export function derivedTitle(startedAt: number, game: string | null): string {
  const d = new Date(startedAt);
  const day = new Date(d.getHours() < 5 ? startedAt - 5 * 3_600_000 : startedAt).toLocaleDateString("en-US", { weekday: "long" });
  return `${game ? `${game} · ` : ""}${day} ${PART(d.getHours())}`;
}

function recordingRows(db: Db, where: ReturnType<typeof eq> | ReturnType<typeof and>) {
  return db
    .select({
      id: recordings.id,
      title: recordings.title,
      origin: recordings.origin,
      at: recordings.recordedAt,
      source: recordings.recordedAtSource,
      dur: recordings.durationMs,
      sessionId: recordings.sessionId,
      analysis: recordingAnalysis.status,
      transcript: recordingTranscripts.status,
    })
    .from(recordings)
    .leftJoin(recordingAnalysis, eq(recordingAnalysis.recordingId, recordings.id))
    .leftJoin(recordingTranscripts, eq(recordingTranscripts.recordingId, recordings.id))
    .where(where)
    .orderBy(sql`${recordings.recordedAt} is null`, asc(recordings.recordedAt), asc(recordings.id))
    .all();
}

function openMomentCounts(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, { n: number; fav: number }>();
  const rows = db
    .select({ id: clipSuggestions.recordingId, n: sql<number>`count(*)`, fav: sql<number>`sum(${clipSuggestions.favoriteAt} is not null)` })
    .from(clipSuggestions)
    .where(and(inArray(clipSuggestions.recordingId, ids), ne(clipSuggestions.status, "dismissed")))
    .groupBy(clipSuggestions.recordingId)
    .all();
  return new Map(rows.map((r) => [r.id, { n: r.n, fav: r.fav ?? 0 }]));
}

const toTimeline = (r: ReturnType<typeof recordingRows>[number], urls: MediaUrls, moments: number): TimelineRecording => ({
  id: r.id,
  title: r.title,
  origin: r.origin,
  startAt: r.at,
  timeSource: r.at === null ? null : r.source,
  durationMs: r.dur ?? 0,
  posterUrl: urls.get(r.id)?.posterUrl ?? null,
  videoUrl: urls.get(r.id)?.videoUrl ?? null,
  analysis: r.analysis ?? "none",
  transcript: r.transcript ?? "none",
  momentCount: moments,
});

function summarize(db: Db, s: typeof sessions.$inferSelect, recs: ReturnType<typeof recordingRows>, urls: MediaUrls): SessionSummary {
  const ids = recs.map((r) => r.id);
  const counts = openMomentCounts(db, ids);
  const lines = ids.length ? (db.select({ n: sql<number>`count(*)` }).from(transcriptSegments).where(and(inArray(transcriptSegments.recordingId, ids), sql`${transcriptSegments.flaggedAt} is null`)).get()?.n ?? 0) : 0;
  // Cover: the strongest moment's keyframe, else the first poster.
  let coverUrl: string | null = null;
  for (const r of recs) {
    const top = listSuggestions(db, r.id).filter((x) => x.status !== "dismissed" && x.thumbUrl).sort((a, b) => b.score - a.score)[0];
    if (top?.thumbUrl) {
      coverUrl = top.thumbUrl;
      break;
    }
  }
  coverUrl ??= recs.map((r) => urls.get(r.id)?.posterUrl).find(Boolean) ?? null;
  const timeKnown = recs.some((r) => r.at !== null);
  return {
    id: s.id,
    title: s.title ?? (timeKnown ? derivedTitle(s.startedAt, s.game) : UNDATED_TITLE),
    titleIsCustom: Boolean(s.title),
    timeKnown,
    game: s.game,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    approximate: recs.some((r) => r.at === null || (r.source !== null && APPROXIMATE_SOURCES.has(r.source))),
    locked: s.locked,
    recordingCount: recs.length,
    footageMs: recs.reduce((a, r) => a + (r.dur ?? 0), 0),
    momentCount: [...counts.values()].reduce((a, c) => a + c.n, 0),
    favoriteCount: [...counts.values()].reduce((a, c) => a + c.fav, 0),
    transcriptLines: lines,
    analyzedCount: recs.filter((r) => r.analysis === "done").length,
    coverUrl,
  };
}

export function timeMachineOverview(db: Db, urls: MediaUrls): TimeMachineOverview {
  syncSessions(db);
  const all = db.select().from(sessions).orderBy(sql`${sessions.startedAt} desc`).all();
  const recs = recordingRows(db, and(ne(recordings.origin, "clip"), inArray(recordings.status, [...PLAYABLE]))!);
  const loose = recs.filter((r) => !r.sessionId);
  const counts = openMomentCounts(db, loose.map((r) => r.id));
  return {
    sessions: all.map((s) => summarize(db, s, recs.filter((r) => r.sessionId === s.id), urls)),
    undated: loose.filter((r) => r.at === null).map((r) => toTimeline(r, urls, counts.get(r.id)?.n ?? 0)),
    ungrouped: loose.filter((r) => r.at !== null).map((r) => toTimeline(r, urls, counts.get(r.id)?.n ?? 0)),
    gapMinutes: getGapMinutes(db),
    games: [...new Set(recs.map((r) => db.select({ g: recordings.game }).from(recordings).where(eq(recordings.id, r.id)).get()?.g).filter((g): g is string => Boolean(g)))],
  };
}

export function sessionDetail(db: Db, id: string, urls: MediaUrls): SessionDetail | null {
  syncSessions(db);
  const s = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!s) return null;
  const recs = recordingRows(db, and(eq(recordings.sessionId, id), ne(recordings.origin, "clip"))!);
  const counts = openMomentCounts(db, recs.map((r) => r.id));
  const moments: TimelineMoment[] = [];
  const seen = new Set<string>();
  for (const r of recs) {
    for (const m of listSuggestions(db, r.id)) {
      if (m.status === "dismissed" || seen.has(m.id)) continue;
      seen.add(m.id);
      moments.push({
        id: m.id,
        recordingId: r.id,
        startMs: m.startMs,
        endMs: m.endMs,
        at: r.at === null ? null : r.at + m.startMs,
        title: m.title,
        confidence: m.confidence,
        evidence: m.evidence,
        speech: m.speech,
        uncertainty: m.uncertainty,
        thumbUrl: m.thumbUrl,
        favorite: m.favorite,
        saved: m.saveStatus === "saved",
      });
    }
  }
  // Chronological: recordings are already in time order; within each, by offset.
  const order = new Map(recs.map((r, i) => [r.id, i]));
  moments.sort((a, b) => order.get(a.recordingId)! - order.get(b.recordingId)! || a.startMs - b.startMs);
  const dated = new Set(db.select({ id: recordings.sessionId }).from(recordings).where(isNotNull(recordings.recordedAt)).all().map((r) => r.id));
  return {
    summary: summarize(db, s, recs, urls),
    recordings: recs.map((r) => toTimeline(r, urls, counts.get(r.id)?.n ?? 0)),
    moments,
    others: db
      .select({ id: sessions.id, title: sessions.title, startedAt: sessions.startedAt, game: sessions.game })
      .from(sessions)
      .where(ne(sessions.id, id))
      .orderBy(sql`${sessions.startedAt} desc`)
      .all()
      .map((o) => ({ id: o.id, title: o.title ?? (dated.has(o.id) ? derivedTitle(o.startedAt, o.game) : UNDATED_TITLE), startedAt: o.startedAt })),
  };
}

export const isSessionId = (id: string) => /^ses_[0-9a-f]{16}$/.test(id);
