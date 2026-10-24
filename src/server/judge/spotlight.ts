import "server-only";
import fs from "node:fs";
import { asc, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "../db/client";
import { povGroups, povMembers, recordings, transcriptSegments } from "../db/schema";
import { managedPath } from "../media/storage";
import { listStories } from "../studio/stories";
import { mediaUrls } from "../timemachine/media-urls";
import { sessionDetail, timeMachineOverview } from "../timemachine/sessions";
import type { SessionSummary, TimelineMoment } from "@/lib/timemachine/types";
import { pickRecallLine } from "@/lib/judge/recall-line";
import type { TourTargets } from "@/lib/judge/tour";

// What the showcase, the home dashboard and the guided judge tour point at.
// Read-only and built from real rows: anything missing comes back null so the
// UI can say so instead of inventing a stand-in.

export type SpotlightMoment = Pick<TimelineMoment, "id" | "recordingId" | "startMs" | "endMs" | "title" | "confidence" | "thumbUrl"> & {
  videoUrl: string | null;
};

export type Spotlight = {
  night: SessionSummary | null;
  /** The night's strongest moments that have a keyframe, best first. */
  moments: SpotlightMoment[];
  recall: { line: string; lines: number; recordings: number } | null;
  pov: { groupId: string; firstRecordingId: string; members: number; confirmed: boolean; titles: string[] } | null;
  story: { id: string; title: string; clipCount: number; count: number; exported: boolean } | null;
};

const CONFIDENCE = { strong: 0, moderate: 1, weak: 2 } as const;

/** Deduped per request: the showcase and home read it from several Suspense boundaries. */
export const spotlight = cache((): Spotlight => {
  const db = getDb();
  const urls = mediaUrls();

  // The night with the most to show: moments first, then transcript lines.
  const nights = timeMachineOverview(db, urls).sessions;
  const night = [...nights].sort((a, b) => b.momentCount - a.momentCount || b.transcriptLines - a.transcriptLines || b.startedAt - a.startedAt)[0] ?? null;
  const detail = night ? sessionDetail(db, night.id, urls) : null;
  const videoOf = new Map(detail?.recordings.map((r) => [r.id, r.videoUrl]) ?? []);
  // Best first, one per recording before any repeats, so the night reads as a night.
  const ranked = (detail?.moments ?? [])
    .filter((m) => m.thumbUrl)
    .sort((a, b) => CONFIDENCE[a.confidence] - CONFIDENCE[b.confidence] || a.startMs - b.startMs);
  const firsts = new Set<string>();
  const lead = ranked.filter((m) => !firsts.has(m.recordingId) && Boolean(firsts.add(m.recordingId)));
  const spread = [...lead, ...ranked.filter((m) => !lead.includes(m))];
  const moments: SpotlightMoment[] = spread
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      recordingId: m.recordingId,
      startMs: m.startMs,
      endMs: m.endMs,
      title: m.title,
      confidence: m.confidence,
      thumbUrl: m.thumbUrl,
      videoUrl: videoOf.get(m.recordingId) ?? null,
    }));

  // A line someone actually said, so the Recall step searches real speech.
  const live = sql`${transcriptSegments.flaggedAt} is null`;
  const totals = db
    .select({ lines: sql<number>`count(*)`, recordings: sql<number>`count(distinct ${transcriptSegments.recordingId})` })
    .from(transcriptSegments)
    .where(live)
    .get();
  const preferred = detail?.recordings.map((r) => r.id) ?? [];
  const candidates = db
    .select({ text: transcriptSegments.text, recordingId: transcriptSegments.recordingId })
    .from(transcriptSegments)
    .where(live)
    .orderBy(asc(transcriptSegments.recordingId), asc(transcriptSegments.startMs))
    .all();
  const line =
    pickRecallLine(candidates.filter((c) => preferred.includes(c.recordingId)).map((c) => c.text)) ??
    pickRecallLine(candidates.map((c) => c.text));
  const recall = line && totals ? { line, lines: totals.lines, recordings: totals.recordings } : null;

  // The most recent POV group.
  const group = db.select({ id: povGroups.id }).from(povGroups).orderBy(desc(povGroups.createdAt)).limit(1).get();
  const members = group
    ? db
        .select({ id: povMembers.recordingId, confirmed: povMembers.syncConfirmed, title: recordings.title })
        .from(povMembers)
        .innerJoin(recordings, eq(recordings.id, povMembers.recordingId))
        .where(eq(povMembers.groupId, group.id))
        .orderBy(asc(povMembers.offsetMs))
        .all()
    : [];
  const pov =
    group && members.length >= 2
      ? { groupId: group.id, firstRecordingId: members[0].id, members: members.length, confirmed: members.every((m) => m.confirmed), titles: members.map((m) => m.title) }
      : null;

  const stories = listStories(db, urls);
  const latest = stories[0];
  const story = latest
    ? { id: latest.id, title: latest.title, clipCount: latest.clipCount, count: stories.length, exported: latest.lastExport?.status === "done" }
    : null;

  return { night, moments, recall, pov, story };
});


/** What the guided tour needs from the spotlight (plain data for the client). */
export function tourTargets(s: Spotlight): TourTargets {
  return {
    recallLine: s.recall?.line ?? null,
    nightId: s.night?.id ?? null,
    povGroupId: s.pov?.groupId ?? null,
    povRecordingId: s.pov?.firstRecordingId ?? null,
    storyId: s.story?.id ?? null,
  };
}

export type Reel = { recordingId: string; title: string | null; posterUrl: string; videoUrl: string | null; durationMs: number };

/** A filename a person chose ("peak pov 2"), not a generated ID ("7ds8NbR52 kveYy"). */
function readable(title: string): string | null {
  const words = title.trim().split(/\s+/);
  const generated = words.some((w) => w.length > 12 || (/\d/.test(w) && /[a-z]/i.test(w)) || /[a-z][A-Z]/.test(w));
  return generated ? null : title.trim();
}

const vivid = new Map<string, number>();

/**
 * How colourful and bright a poster is (Hasler–Süsstrunk colourfulness × mean
 * luminance), so the showcase leads with footage that reads at a glance rather
 * than near-black frames. A measurement of the image, not a judgement of the play.
 */
async function vividness(abs: string): Promise<number | null> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return null;
  }
  const key = `${abs}:${stat.mtimeMs}`;
  const known = vivid.get(key);
  if (known !== undefined) return known;
  try {
    const sharp = (await import("sharp")).default;
    const px = await sharp(abs).resize(64, 36, { fit: "fill" }).removeAlpha().raw().toBuffer();
    let n = 0, mRg = 0, mYb = 0, sRg = 0, sYb = 0, lum = 0;
    for (let i = 0; i + 2 < px.length; i += 3) {
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      const rg = r - g;
      const yb = 0.5 * (r + g) - b;
      n++;
      mRg += rg;
      mYb += yb;
      sRg += rg * rg;
      sYb += yb * yb;
      lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    mRg /= n;
    mYb /= n;
    const colour = Math.sqrt(sRg / n - mRg * mRg + (sYb / n - mYb * mYb)) + 0.3 * Math.sqrt(mRg * mRg + mYb * mYb);
    const score = colour * (lum / n / 255);
    vivid.set(key, score);
    return score;
  } catch {
    return null;
  }
}

/** The featured night's recordings, most vivid poster first. */
export const nightReels = cache(async (): Promise<Reel[]> => {
  const night = spotlight().night;
  if (!night) return [];
  const urls = mediaUrls();
  const rows = getDb()
    .select({ id: recordings.id, title: recordings.title, poster: recordings.posterPath, dur: recordings.durationMs, origin: recordings.origin })
    .from(recordings)
    .where(eq(recordings.sessionId, night.id))
    .all()
    .filter((r) => r.origin !== "clip" && r.poster && urls.get(r.id)?.posterUrl);
  const scored = await Promise.all(
    rows.map(async (r) => {
      let score: number | null = null;
      try {
        score = await vividness(managedPath(r.poster!));
      } catch {
        score = null;
      }
      return { r, score: score ?? 0 };
    }),
  );
  return scored
    .sort((a, b) => b.score - a.score)
    .map(({ r }) => ({ recordingId: r.id, title: readable(r.title), posterUrl: urls.get(r.id)!.posterUrl!, videoUrl: urls.get(r.id)?.videoUrl ?? null, durationMs: r.dur ?? 0 }));
});
