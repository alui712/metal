import "server-only";
import { cache } from "react";
import { getDb } from "../db/client";
import { mediaUrls } from "../timemachine/media-urls";
import { sessionDetail } from "../timemachine/sessions";
import { judgeScope } from "./demo";
import { isFixtureDemo } from "../public-demo";
import { getMemoryRepository } from "@/lib/memory/repository";
import { scopeSession } from "@/lib/judge/scope";
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
  /** The approved line and the approved recording it was said in. */
  recall: { line: string; recordingId: string; label: string | null } | null;
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
  const { demo, allowed, cover } = judgeScope(db);
  const approved = new Set(demo.recordings.map((r) => r.id));

  // The same server-side scope as the judge-mode night page, so counts and covers match it.
  const full = demo.nightId ? sessionDetail(db, demo.nightId, urls) : null;
  const detail = full ? scopeSession(full, allowed, cover) : null;
  const night = detail?.summary ?? null;
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

  const recall = demo.recall
    ? { line: demo.recall.line, recordingId: demo.recall.recordingId, label: demo.recordings.find((r) => r.id === demo.recall!.recordingId)?.label ?? null }
    : null;

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
  if (isFixtureDemo()) {
    const night = getMemoryRepository().sessions()[0];
    return { recall: null, night: night ? { id: night.id, title: night.title } : null, pov: null, story: null, fixtures: true };
  }
  return {
    recall: s.recall ? { line: s.recall.line, recordingId: s.recall.recordingId } : null,
    night: s.night ? { id: s.night.id, title: s.night.title } : null,
    pov: s.pov ? { groupId: s.pov.groupId, recordingId: s.pov.firstRecordingId, members: s.pov.members.length, status: s.pov.status, method: s.pov.method } : null,
    story: s.story ? { id: s.story.id, clipCount: s.story.clipCount, exported: s.story.exported } : null,
  };
}
