import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { config } from "../config";
import type { Db } from "../db/client";
import { clipSuggestions, povMembers, recordings, renderExports, storyClips, storyProjects, transcriptSegments } from "../db/schema";
import { managedPath } from "../media/storage";
import { checkSources, exportFile } from "../studio/render";
import { splitOf } from "../studio/stories";
import { sessionDetail } from "../timemachine/sessions";
import { curate, judgeDemoSchema, type Curated, type DemoFacts, type JudgeDemoConfig } from "@/lib/judge/curate";

// Loads the approved judge demo list and checks it against the library. Plain
// reads only, no "server-only", so `npm run judge:ready` can run it outside Next.

/** data/judge-demo.json beside the database, or METAL_JUDGE_DEMO. */
export function judgeDemoPath(): string {
  const p = process.env.METAL_JUDGE_DEMO;
  return p ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), p) : path.join(config.dataDir, "judge-demo.json");
}

export function loadJudgeDemo(file = judgeDemoPath()): { config: JudgeDemoConfig | null; error: string | null } {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { config: null, error: null };
  }
  try {
    const parsed = judgeDemoSchema.safeParse(JSON.parse(text));
    return parsed.success ? { config: parsed.data, error: null } : { config: null, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  } catch (e) {
    return { config: null, error: e instanceof Error ? e.message : String(e) };
  }
}

function isFile(rel: string | null): boolean {
  if (!rel) return false;
  try {
    return fs.statSync(managedPath(rel)).isFile();
  } catch {
    return false;
  }
}

export function demoFacts(db: Db, c: JudgeDemoConfig): DemoFacts {
  const facts: DemoFacts = { recordings: new Map(), sessions: new Map(), lines: [], povGroups: new Map(), stories: new Map(), exports: new Map() };

  const story = c.story ? db.select({ id: storyProjects.id, title: storyProjects.title }).from(storyProjects).where(eq(storyProjects.id, c.story)).get() : undefined;
  const clips = story ? db.select().from(storyClips).where(eq(storyClips.projectId, story.id)).orderBy(storyClips.position).all() : [];
  const clipIds = clips.map((c) => c.recordingId);
  const members = c.pov ? db.select().from(povMembers).where(eq(povMembers.groupId, c.pov)).all() : [];

  const ids = [...new Set([...c.recordings.map((r) => r.id), ...members.map((m) => m.recordingId), ...clipIds.filter((x): x is string => !!x)])];
  if (ids.length) {
    for (const r of db.select().from(recordings).where(inArray(recordings.id, ids)).all()) {
      const ready = r.status === "ready" || r.status === "analyzed";
      facts.recordings.set(r.id, { id: r.id, title: r.title, playable: ready && isFile(r.proxyPath ?? r.originalPath), hasPoster: isFile(r.posterPath), durationMs: r.durationMs ?? 0 });
    }
    facts.lines = db
      .select({ text: transcriptSegments.text, recordingId: transcriptSegments.recordingId, startMs: transcriptSegments.startMs })
      .from(transcriptSegments)
      .where(and(inArray(transcriptSegments.recordingId, ids), isNull(transcriptSegments.flaggedAt)))
      .orderBy(transcriptSegments.recordingId, transcriptSegments.startMs)
      .all();
  }

  if (c.night) {
    const night = sessionDetail(db, c.night, new Map());
    if (night) facts.sessions.set(night.summary.id, { id: night.summary.id, title: night.summary.title, momentRecordingIds: night.moments.map((m) => m.recordingId) });
  }
  if (c.pov && members.length) {
    facts.povGroups.set(
      c.pov,
      members.map((m) => ({ recordingId: m.recordingId, offsetMs: m.offsetMs, syncSource: m.syncSource, confirmed: m.syncConfirmed })),
    );
  }
  if (c.exports.length) {
    for (const e of db.select({ id: renderExports.id, projectId: renderExports.projectId, status: renderExports.status }).from(renderExports).where(inArray(renderExports.id, c.exports)).all()) {
      let fileOk = false;
      try {
        fileOk = fs.statSync(exportFile(e.id)).isFile();
      } catch {}
      facts.exports.set(e.id, { id: e.id, projectId: e.projectId, succeeded: e.status === "succeeded", fileOk });
    }
  }
  if (story) {
    // A clip whose recording was deleted (null) can't play, so it fails the check.
    // The exporter's own checks: source present on disk and each range inside the video.
    const { issues } = checkSources(db, clips.map((c) => ({ ...c, secondary: splitOf(c) })));
    facts.stories.set(story.id, {
      id: story.id,
      title: story.title,
      clipRecordingIds: clipIds.map((x) => x ?? "(deleted)"),
      clipIssues: issues.map((i) => `Clip ${i.index + 1}: ${i.reason}`),
    });
  }
  return facts;
}

export function curatedDemo(db: Db, file = judgeDemoPath()): Curated {
  const { config: c, error } = loadJudgeDemo(file);
  const out = curate(c, c ? demoFacts(db, c) : { recordings: new Map(), sessions: new Map(), lines: [], povGroups: new Map(), stories: new Map(), exports: new Map() });
  if (error) out.checks.unshift({ area: "config", ref: path.basename(file), ready: false, detail: `Invalid: ${error}` });
  return out;
}

/** Judge-mode scope: the curated demo plus the approved, playable recording ids. */
export function judgeScope(db: Db): { demo: Curated; allowed: Set<string>; cover: string | null } {
  const demo = curatedDemo(db);
  // Only a verified approved poster; never the session's own (possibly unapproved) cover.
  const first = demo.recordings[0];
  return { demo, allowed: new Set(demo.allowed), cover: first ? `/api/media/${first.id}/poster` : null };
}

export type Touches = { recordings?: (string | null | undefined)[]; sessions?: (string | null | undefined)[]; stories?: (string | null | undefined)[]; povs?: (string | null | undefined)[]; exports?: (string | null | undefined)[]; regroup?: boolean };

/**
 * With `"lock": true` in the approved list, writes that touch approved content are
 * refused (423) for every caller, whatever the UI does. It protects the listed items
 * (and, for `regroup`, the night's grouping), not the rest of the library, and it
 * is a switch on this computer, not authentication.
 */
export function judgeLocked(db: Db, t: Touches): Response | null {
  const { config: c } = loadJudgeDemo();
  if (!c?.lock) return null;
  const members = c.pov ? db.select({ id: povMembers.recordingId }).from(povMembers).where(eq(povMembers.groupId, c.pov)).all().map((m) => m.id) : [];
  const recs = new Set([...c.recordings.map((r) => r.id), ...members]);
  const hit =
    t.regroup ||
    t.recordings?.some((id) => id && recs.has(id)) ||
    t.sessions?.some((id) => id && id === c.night) ||
    t.stories?.some((id) => id && id === c.story) ||
    t.povs?.some((id) => id && id === c.pov) ||
    t.exports?.some((id) => id && c.exports.includes(id));
  return hit ? Response.json({ error: "Locked for the judge demo. Turn off \"lock\" in judge-demo.json to edit approved content." }, { status: 423 }) : null;
}

/** Recording behind a moment (clip suggestion) or transcript line, for lock checks. */
export const recordingOfMoment = (db: Db, id: string) => db.select({ r: clipSuggestions.recordingId }).from(clipSuggestions).where(eq(clipSuggestions.id, id)).get()?.r ?? null;
export const recordingOfLine = (db: Db, id: string) => db.select({ r: transcriptSegments.recordingId }).from(transcriptSegments).where(eq(transcriptSegments.id, id)).get()?.r ?? null;
