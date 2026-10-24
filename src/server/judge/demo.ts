import fs from "node:fs";
import path from "node:path";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { config } from "../config";
import type { Db } from "../db/client";
import { povMembers, recordings, renderExports, storyClips, storyProjects, transcriptSegments } from "../db/schema";
import { managedPath } from "../media/storage";
import { timeMachineOverview } from "../timemachine/sessions";
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
  const facts: DemoFacts = { recordings: new Map(), sessions: new Map(), lines: [], povGroups: new Map(), stories: new Map() };

  const story = c.story ? db.select({ id: storyProjects.id, title: storyProjects.title }).from(storyProjects).where(eq(storyProjects.id, c.story)).get() : undefined;
  const clipIds = story
    ? db.select({ recordingId: storyClips.recordingId }).from(storyClips).where(eq(storyClips.projectId, story.id)).orderBy(storyClips.position).all().map((r) => r.recordingId)
    : [];
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
    const night = timeMachineOverview(db, new Map()).sessions.find((s) => s.id === c.night);
    if (night) facts.sessions.set(night.id, { id: night.id, title: night.title });
  }
  if (c.pov && members.length) {
    facts.povGroups.set(
      c.pov,
      members.map((m) => ({ recordingId: m.recordingId, offsetMs: m.offsetMs, syncSource: m.syncSource, confirmed: m.syncConfirmed })),
    );
  }
  if (story) {
    const last = db.select({ status: renderExports.status }).from(renderExports).where(eq(renderExports.projectId, story.id)).orderBy(desc(renderExports.createdAt)).get();
    // A clip whose recording was deleted (null) can't play, so it fails the check.
    facts.stories.set(story.id, { id: story.id, title: story.title, clipRecordingIds: clipIds.map((x) => x ?? "(deleted)"), exported: last?.status === "succeeded" });
  }
  return facts;
}

export function curatedDemo(db: Db, file = judgeDemoPath()): Curated {
  const { config: c, error } = loadJudgeDemo(file);
  const out = curate(c, c ? demoFacts(db, c) : { recordings: new Map(), sessions: new Map(), lines: [], povGroups: new Map(), stories: new Map() });
  if (error) out.checks.unshift({ area: "config", ref: path.basename(file), ready: false, detail: `Invalid: ${error}` });
  return out;
}
