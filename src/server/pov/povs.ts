import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { JobContext } from "../../worker/handlers";
import type { Db } from "../db/client";
import { jobs, povGroups, povMatches, povMembers, recordings } from "../db/schema";
import { newId } from "../ids";
import { enqueueJob } from "../jobs/queue";
import { PermanentJobError } from "../jobs/errors";
import { APPROXIMATE_SOURCES, type RecordedAtSource } from "../media/recorded-time";
import { managedPath } from "../media/storage";
import type { MediaUrls } from "../timemachine/sessions";
import type { PovCandidate, PovGroupView, PovView, TimeEvidence } from "@/lib/pov/types";
import { alignEnvelopes, classifyAlignment, decodeEnvelope } from "./audio-sync";

// Multi-POV (ADR 0019). Candidates come only from evidence: recording clocks
// that overlap, the game tag, and shared audio measured by "Find other POVs".
// Nothing is paired until the user pairs it; offsets stay "suggested" until
// the user confirms or adjusts them.

export const MAX_POV_MEMBERS = 6;
/** Two recordings within this gap of each other might still be the same match (clocks drift). */
const NEAR_MS = 2 * 60_000;
/** Clock-based audio search window: different PCs' clocks can disagree by this much. */
const CLOCK_WINDOW_MS = 2 * 60_000;
/** Recordings with unknown times checked by audio per run (most recent first). */
const MAX_UNDATED_CHECKS = 8;

export const isPovGroupId = (id: string) => /^pov_[0-9a-f]{16}$/.test(id);

type Rec = typeof recordings.$inferSelect;

const playable = (r: Rec) => r.proxyPath ?? r.originalPath;
const isReady = (r: Rec) => r.status === "ready" || r.status === "analyzed";

/** What the recording clocks say about b relative to a. Pure. */
export function timeEvidence(
  a: { recordedAt: number | null; recordedAtSource: RecordedAtSource | null; durationMs: number | null },
  b: { recordedAt: number | null; recordedAtSource: RecordedAtSource | null; durationMs: number | null },
): TimeEvidence {
  if (a.recordedAt === null || b.recordedAt === null) return { kind: "unknown" };
  const approximate = APPROXIMATE_SOURCES.has(a.recordedAtSource!) || APPROXIMATE_SOURCES.has(b.recordedAtSource!);
  const clockOffsetMs = b.recordedAt - a.recordedAt;
  const aEnd = a.recordedAt + (a.durationMs ?? 0);
  const bEnd = b.recordedAt + (b.durationMs ?? 0);
  const overlapMs = Math.min(aEnd, bEnd) - Math.max(a.recordedAt, b.recordedAt);
  if (overlapMs > 0) return { kind: "overlap", overlapMs, clockOffsetMs, approximate };
  const gapMs = -overlapMs;
  return gapMs <= NEAR_MS ? { kind: "near", gapMs, clockOffsetMs, approximate } : { kind: "apart" };
}

/** Recordings derived from the same footage (Smart Clip cuts) are the same POV, never another one. */
const sameFootage = (a: Rec, b: Rec) => a.parentRecordingId === b.id || b.parentRecordingId === a.id || (a.parentRecordingId !== null && a.parentRecordingId === b.parentRecordingId);

const gamesDiffer = (a: Rec, b: Rec) => Boolean(a.game && b.game && a.game.trim().toLowerCase() !== b.game.trim().toLowerCase());

/** Other recordings worth checking against `target`: overlapping or near in time, or of unknown time (audio only). */
function candidateRows(db: Db, target: Rec): Array<{ rec: Rec; time: TimeEvidence }> {
  const others = db
    .select()
    .from(recordings)
    .where(and(ne(recordings.id, target.id), ne(recordings.origin, "clip")))
    .orderBy(desc(recordings.importedAt))
    .all()
    .filter((r) => isReady(r) && !sameFootage(target, r) && !gamesDiffer(target, r));
  const out: Array<{ rec: Rec; time: TimeEvidence }> = [];
  let undated = 0;
  for (const rec of others) {
    const time = timeEvidence(target, rec);
    if (time.kind === "apart") continue;
    if (time.kind === "unknown" && ++undated > MAX_UNDATED_CHECKS) continue;
    out.push({ rec, time });
  }
  return out;
}

// ── Find other POVs (worker job) ─────────────────────────────

export function requestPovMatch(db: Db, recordingId: string): "queued" | "busy" {
  const running = db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.kind, "pov-match"), eq(jobs.recordingId, recordingId), inArray(jobs.status, ["queued", "running"])))
    .get();
  if (running) return "busy";
  enqueueJob(db, { kind: "pov-match", recordingId, maxAttempts: 2 });
  return "queued";
}

/** Worker job "pov-match": measures shared audio between a recording and each candidate. */
export async function matchPovs({ db, job, progress, signal }: JobContext): Promise<void> {
  const target = job.recordingId ? db.select().from(recordings).where(eq(recordings.id, job.recordingId)).get() : undefined;
  if (!target || !isReady(target)) throw new PermanentJobError("That recording isn’t available.");
  const rows = candidateRows(db, target);
  progress({ stage: "listening", progress: 0 });
  const mine = await decodeEnvelope(managedPath(playable(target)), { signal });
  const now = Date.now();
  db.delete(povMatches).where(eq(povMatches.recordingId, target.id)).run();
  for (const [i, { rec, time }] of rows.entries()) {
    let row: typeof povMatches.$inferInsert = { recordingId: target.id, candidateId: rec.id, audio: "no-audio", computedAt: now };
    try {
      const theirs = mine ? await decodeEnvelope(managedPath(playable(rec)), { signal }) : null;
      if (mine && theirs) {
        const window = time.kind === "overlap" || time.kind === "near" ? { minLagMs: time.clockOffsetMs - CLOCK_WINDOW_MS, maxLagMs: time.clockOffsetMs + CLOCK_WINDOW_MS } : {};
        const al = alignEnvelopes(mine, theirs, window);
        row = { ...row, audio: classifyAlignment(al), offsetMs: al?.offsetMs ?? null, score: al?.score ?? null, distinct: al?.distinct ?? null, overlapMs: al?.overlapMs ?? null };
      }
    } catch (e) {
      if (signal.aborted) throw e;
      row = { ...row, audio: "error" };
    }
    db.insert(povMatches).values(row).run();
    progress({ progress: (i + 1) / rows.length });
  }
  progress({ stage: "done", progress: 1 });
}

// ── Views ────────────────────────────────────────────────────

export function groupView(db: Db, groupId: string, urls: MediaUrls): PovGroupView | null {
  const rows = db
    .select({ m: povMembers, r: recordings })
    .from(povMembers)
    .innerJoin(recordings, eq(recordings.id, povMembers.recordingId))
    .where(eq(povMembers.groupId, groupId))
    .all();
  if (!rows.length) return null;
  const members = rows
    .map(({ m, r }) => ({
      recordingId: r.id,
      title: r.title,
      playerName: r.ownerLabel,
      game: r.game,
      offsetMs: m.offsetMs,
      durationMs: r.durationMs ?? 0,
      fps: r.fps,
      recordedAt: r.recordedAt,
      syncSource: m.syncSource,
      syncConfirmed: m.syncSource === "anchor" || m.syncConfirmed,
      audioScore: m.audioScore,
      videoUrl: isReady(r) ? (urls.get(r.id)?.videoUrl ?? null) : null,
      posterUrl: urls.get(r.id)?.posterUrl ?? null,
    }))
    .sort((a, b) => a.offsetMs - b.offsetMs || a.title.localeCompare(b.title));
  return {
    id: groupId,
    members,
    startMs: Math.min(...members.map((m) => m.offsetMs)),
    endMs: Math.max(...members.map((m) => m.offsetMs + m.durationMs)),
  };
}

export function povView(db: Db, recordingId: string, urls: MediaUrls): PovView | null {
  const target = db.select().from(recordings).where(eq(recordings.id, recordingId)).get();
  if (!target) return null;
  const member = db.select().from(povMembers).where(eq(povMembers.recordingId, recordingId)).get();
  const group = member ? groupView(db, member.groupId, urls) : null;
  const inGroup = new Set(group?.members.map((m) => m.recordingId));
  const matches = new Map(db.select().from(povMatches).where(eq(povMatches.recordingId, recordingId)).all().map((m) => [m.candidateId, m]));
  const job = db.select().from(jobs).where(and(eq(jobs.kind, "pov-match"), eq(jobs.recordingId, recordingId))).orderBy(desc(jobs.createdAt)).get();
  const candidates: PovCandidate[] = [];
  let undatedChecked = 0;
  for (const { rec, time } of isReady(target) ? candidateRows(db, target) : []) {
    const m = matches.get(rec.id);
    const audio = m ? { status: m.audio, offsetMs: m.offsetMs, score: m.score, distinct: m.distinct, overlapMs: m.overlapMs } : null;
    const reliable = audio?.status === "reliable" && audio.offsetMs !== null;
    // Unknown times: only shared audio is evidence. Without it, it's not a candidate.
    if (time.kind === "unknown" && !reliable) {
      if (m) undatedChecked++;
      continue;
    }
    candidates.push({
      recordingId: rec.id,
      title: rec.title,
      playerName: rec.ownerLabel,
      game: rec.game,
      durationMs: rec.durationMs ?? 0,
      recordedAt: rec.recordedAt,
      posterUrl: urls.get(rec.id)?.posterUrl ?? null,
      time,
      sameGame: Boolean(target.game && rec.game && !gamesDiffer(target, rec)),
      audio,
      suggested: reliable ? { offsetMs: audio.offsetMs!, source: "audio" } : time.kind === "overlap" || time.kind === "near" ? { offsetMs: time.clockOffsetMs, source: "clock" } : null,
      confidence: reliable ? "likely" : "possible",
      pairedHere: inGroup.has(rec.id),
    });
  }
  candidates.sort((a, b) => (a.confidence === b.confidence ? (b.audio?.distinct ?? 0) - (a.audio?.distinct ?? 0) : a.confidence === "likely" ? -1 : 1));
  const pairable = db
    .select()
    .from(recordings)
    .where(and(ne(recordings.id, recordingId), ne(recordings.origin, "clip")))
    .orderBy(desc(recordings.importedAt))
    .all()
    .filter((r) => isReady(r) && !inGroup.has(r.id))
    .map((r) => ({ id: r.id, title: r.title, recordedAt: r.recordedAt, durationMs: r.durationMs ?? 0 }));
  return {
    recordingId,
    group,
    candidates,
    undatedChecked,
    checkedAt: matches.size ? Math.max(...[...matches.values()].map((m) => m.computedAt)) : null,
    job: job ? { status: job.status, progress: job.progress, error: job.error } : null,
    pairable,
  };
}

// ── Edits (user actions) ─────────────────────────────────────

type Result = { groupId: string } | { error: string; status: number };

/**
 * Pairs `otherId` with `recordingId`: `offsetMs` is where the other's 0:00
 * falls on this recording's timeline. Joins or merges existing groups. The
 * new offset is a suggestion until the user confirms or adjusts it.
 */
export function pairPov(
  db: Db,
  input: { recordingId: string; otherId: string; offsetMs: number; source: "clock" | "audio" | "manual"; audioScore?: number | null },
): Result {
  if (input.recordingId === input.otherId) return { error: "Pick a different recording.", status: 400 };
  const recs = db.select().from(recordings).where(inArray(recordings.id, [input.recordingId, input.otherId])).all();
  if (recs.length !== 2 || !recs.every(isReady)) return { error: "Both recordings must be in the library and ready.", status: 409 };
  const offset = Math.round(input.offsetMs);
  return db.$client
    .transaction((): Result => {
      const ma = db.select().from(povMembers).where(eq(povMembers.recordingId, input.recordingId)).get();
      const mb = db.select().from(povMembers).where(eq(povMembers.recordingId, input.otherId)).get();
      const size = (g: string) => db.select({ id: povMembers.recordingId }).from(povMembers).where(eq(povMembers.groupId, g)).all().length;
      const fields = { syncSource: input.source, syncConfirmed: false, audioScore: input.source === "audio" ? (input.audioScore ?? null) : null };
      const now = Date.now();
      if (!ma && !mb) {
        const groupId = newId("pov");
        db.insert(povGroups).values({ id: groupId, updatedAt: now }).run();
        db.insert(povMembers).values({ recordingId: input.recordingId, groupId, offsetMs: 0, syncSource: "anchor", syncConfirmed: true }).run();
        db.insert(povMembers).values({ recordingId: input.otherId, groupId, offsetMs: offset, ...fields }).run();
        return { groupId };
      }
      if (ma && !mb) {
        if (size(ma.groupId) >= MAX_POV_MEMBERS) return { error: `A POV group can have at most ${MAX_POV_MEMBERS} recordings.`, status: 409 };
        db.insert(povMembers).values({ recordingId: input.otherId, groupId: ma.groupId, offsetMs: ma.offsetMs + offset, ...fields }).run();
        db.update(povGroups).set({ updatedAt: now }).where(eq(povGroups.id, ma.groupId)).run();
        return { groupId: ma.groupId };
      }
      if (!ma && mb) {
        if (size(mb.groupId) >= MAX_POV_MEMBERS) return { error: `A POV group can have at most ${MAX_POV_MEMBERS} recordings.`, status: 409 };
        db.insert(povMembers).values({ recordingId: input.recordingId, groupId: mb.groupId, offsetMs: mb.offsetMs - offset, ...fields }).run();
        db.update(povGroups).set({ updatedAt: now }).where(eq(povGroups.id, mb.groupId)).run();
        return { groupId: mb.groupId };
      }
      const a = ma!;
      const b = mb!;
      if (a.groupId === b.groupId) {
        db.update(povMembers).set({ offsetMs: a.offsetMs + offset, ...fields }).where(eq(povMembers.recordingId, b.recordingId)).run();
      } else {
        if (size(a.groupId) + size(b.groupId) > MAX_POV_MEMBERS) return { error: `A POV group can have at most ${MAX_POV_MEMBERS} recordings.`, status: 409 };
        // Merge b's group into a's, shifted so b lands where the pairing says.
        const shift = a.offsetMs + offset - b.offsetMs;
        for (const m of db.select().from(povMembers).where(eq(povMembers.groupId, b.groupId)).all())
          db.update(povMembers).set({ groupId: a.groupId, offsetMs: m.offsetMs + shift, ...(m.recordingId === b.recordingId ? fields : {}) }).where(eq(povMembers.recordingId, m.recordingId)).run();
        db.delete(povGroups).where(eq(povGroups.id, b.groupId)).run();
      }
      db.update(povGroups).set({ updatedAt: now }).where(eq(povGroups.id, a.groupId)).run();
      return { groupId: a.groupId };
    })
    .immediate();
}

/** The user's own offset for one member (nudged or typed in the viewer): confirmed by definition. */
export function setPovOffset(db: Db, recordingId: string, offsetMs: number): Result {
  const m = db.select().from(povMembers).where(eq(povMembers.recordingId, recordingId)).get();
  if (!m) return { error: "That recording isn’t paired.", status: 404 };
  db.update(povMembers).set({ offsetMs: Math.round(offsetMs), syncSource: m.syncSource === "anchor" ? "anchor" : "manual", syncConfirmed: true }).where(eq(povMembers.recordingId, recordingId)).run();
  db.update(povGroups).set({ updatedAt: Date.now() }).where(eq(povGroups.id, m.groupId)).run();
  return { groupId: m.groupId };
}

/** "Looks right": keeps the suggested offset and marks it confirmed. */
export function confirmPovSync(db: Db, recordingId: string): Result {
  const m = db.select().from(povMembers).where(eq(povMembers.recordingId, recordingId)).get();
  if (!m) return { error: "That recording isn’t paired.", status: 404 };
  db.update(povMembers).set({ syncConfirmed: true }).where(eq(povMembers.recordingId, recordingId)).run();
  return { groupId: m.groupId };
}

/** Removes one recording from its group; a group of one is dissolved. Never touches the recordings. */
export function unpairPov(db: Db, recordingId: string): { groupId: string | null } | { error: string; status: number } {
  return db.$client
    .transaction(() => {
      const m = db.select().from(povMembers).where(eq(povMembers.recordingId, recordingId)).get();
      if (!m) return { error: "That recording isn’t paired.", status: 404 };
      db.delete(povMembers).where(eq(povMembers.recordingId, recordingId)).run();
      const left = db.select().from(povMembers).where(eq(povMembers.groupId, m.groupId)).all();
      if (left.length < 2) {
        db.delete(povGroups).where(eq(povGroups.id, m.groupId)).run();
        return { groupId: null };
      }
      return { groupId: m.groupId };
    })
    .immediate();
}

/** The player's name for a recording's POV, as the user typed it (or cleared). */
export function setPlayerName(db: Db, recordingId: string, name: string | null): boolean {
  const v = name?.replace(/\s+/g, " ").trim().slice(0, 40) || null;
  return db.update(recordings).set({ ownerLabel: v }).where(eq(recordings.id, recordingId)).run().changes > 0;
}
