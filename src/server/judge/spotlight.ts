import "server-only";
import { sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "../db/client";
import { transcriptSegments } from "../db/schema";
import { mediaUrls } from "../timemachine/media-urls";
import { sessionDetail, timeMachineOverview } from "../timemachine/sessions";
import { curatedDemo } from "./demo";
import type { Curated, CuratedPov } from "@/lib/judge/curate";
import type { SessionSummary, TimelineMoment } from "@/lib/timemachine/types";
import type { TourTargets } from "@/lib/judge/tour";

// What the showcase, the home dashboard and the guided judge tour point at:
// only the approved judge demo list (data/judge-demo.json, ADR 0020), checked
// against real rows. Anything missing or unapproved comes back null so the UI
// says so instead of reaching for whatever is newest.

export type SpotlightMoment = Pick<TimelineMoment, "id" | "recordingId" | "startMs" | "endMs" | "title" | "confidence" | "thumbUrl"> & {
  videoUrl: string | null;
};

export type Spotlight = {
  night: SessionSummary | null;
  /** The night's strongest moments from approved recordings that have a keyframe, best first. */
  moments: SpotlightMoment[];
  recall: { line: string; lines: number; recordings: number } | null;
  pov: (CuratedPov & { titles: string[] }) | null;
  story: Curated["story"];
  /** Approved recordings in their configured order, with media URLs. */
  reels: Reel[];
};

export type Reel = { recordingId: string; title: string | null; posterUrl: string; videoUrl: string | null; durationMs: number };

const CONFIDENCE = { strong: 0, moderate: 1, weak: 2 } as const;

/** Deduped per request: the showcase and home read it from several Suspense boundaries. */
export const spotlight = cache((): Spotlight => {
  const db = getDb();
  const urls = mediaUrls();
  const demo = curatedDemo(db);
  const approved = new Set(demo.recordings.map((r) => r.id));

  const night = demo.nightId ? (timeMachineOverview(db, urls).sessions.find((s) => s.id === demo.nightId) ?? null) : null;
  const detail = night ? sessionDetail(db, night.id, urls) : null;
  const meta = new Map(detail?.recordings.map((r) => [r.id, r]) ?? []);
  // Best first, one per recording before any repeats, so the night reads as a night.
  const ranked = (detail?.moments ?? [])
    .filter((m) => m.thumbUrl && approved.has(m.recordingId))
    .sort((a, b) => CONFIDENCE[a.confidence] - CONFIDENCE[b.confidence] || a.startMs - b.startMs);
  const firsts = new Set<string>();
  const lead = ranked.filter((m) => !firsts.has(m.recordingId) && Boolean(firsts.add(m.recordingId)));
  const moments: SpotlightMoment[] = [...lead, ...ranked.filter((m) => !lead.includes(m))].slice(0, 8).map((m) => ({
    id: m.id,
    recordingId: m.recordingId,
    startMs: m.startMs,
    endMs: m.endMs,
    title: m.title,
    confidence: m.confidence,
    thumbUrl: m.thumbUrl,
    videoUrl: meta.get(m.recordingId)?.videoUrl ?? null,
  }));

  // Library-wide counts only; the line itself is the approved one.
  const totals = demo.recall
    ? db
        .select({ lines: sql<number>`count(*)`, recordings: sql<number>`count(distinct ${transcriptSegments.recordingId})` })
        .from(transcriptSegments)
        .where(sql`${transcriptSegments.flaggedAt} is null`)
        .get()
    : undefined;
  const recall = demo.recall && totals ? { line: demo.recall.line, lines: totals.lines, recordings: totals.recordings } : null;

  const reels: Reel[] = demo.recordings.flatMap(({ id, label, durationMs }) => {
    const u = urls.get(id);
    return u?.posterUrl ? [{ recordingId: id, title: label, posterUrl: u.posterUrl, videoUrl: u.videoUrl, durationMs }] : [];
  });

  return {
    night,
    moments,
    recall,
    pov: demo.pov ? { ...demo.pov, titles: demo.pov.members.map((m) => m.label) } : null,
    story: demo.story,
    reels,
  };
});

/** What the guided tour needs from the spotlight (plain data for the client). */
export function tourTargets(s: Spotlight): TourTargets {
  return {
    recallLine: s.recall?.line ?? null,
    night: s.night ? { id: s.night.id, title: s.night.title } : null,
    pov: s.pov ? { groupId: s.pov.groupId, recordingId: s.pov.firstRecordingId, members: s.pov.members.length, status: s.pov.status, method: s.pov.method } : null,
    story: s.story ? { id: s.story.id, clipCount: s.story.clipCount, exported: s.story.exported } : null,
  };
}
