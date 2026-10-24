import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { clipSuggestions, recordings, sessions, storyClips, storyProjects } from "../db/schema";
import { newId } from "../ids";
import { listSuggestions } from "../smartclip/actions";
import type { Moment, Recording, StoryProject } from "@/lib/memory/contracts";
import { sessionTitle, type MediaUrls } from "./sessions";

// Time Machine → Story Studio handoff: real recording ids and the moments'
// own boundaries, in the order they happened, stored as a story project.

export const MAX_STORY_CLIPS = 30;

export function createStory(db: Db, input: { sessionId: string | null; momentIds: string[]; title?: string }): { id: string } | { error: string } {
  const ids = [...new Set(input.momentIds)].slice(0, MAX_STORY_CLIPS);
  if (!ids.length) return { error: "Pick at least one moment." };
  const rows = db
    .select({ s: clipSuggestions, at: recordings.recordedAt })
    .from(clipSuggestions)
    .innerJoin(recordings, eq(recordings.id, clipSuggestions.recordingId))
    .where(inArray(clipSuggestions.id, ids))
    .all()
    .filter((r) => r.s.status !== "dismissed");
  if (rows.length !== ids.length) return { error: "Some of those moments no longer exist or were dismissed." };
  // Chronological: by wall-clock time when known; otherwise keep the order given (Time Machine's order).
  const given = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (a.at !== null && b.at !== null ? a.at + a.s.startMs - (b.at + b.s.startMs) : given.get(a.s.id)! - given.get(b.s.id)!));
  const session = input.sessionId ? db.select().from(sessions).where(eq(sessions.id, input.sessionId)).get() : undefined;
  const id = newId("sty");
  const now = Date.now();
  db.$client.transaction(() => {
    db.insert(storyProjects)
      .values({ id, title: (input.title?.trim() || (session ? sessionTitle(db, session) : "My story")).slice(0, 80), sourceSessionId: session?.id ?? null, updatedAt: now })
      .run();
    rows.forEach((r, i) =>
      db.insert(storyClips).values({ id: newId("stc"), projectId: id, position: i, recordingId: r.s.recordingId, suggestionId: r.s.id, inMs: r.s.startMs, outMs: r.s.endMs, caption: r.s.title }).run(),
    );
  }).immediate();
  return { id };
}

export type StoryView = {
  project: StoryProject;
  recordings: Record<string, Recording>;
  moments: Record<string, Moment>;
  candidates: Moment[];
  sourceSession: { id: string; title: string } | null;
};

const ART = (id: string) => ({ variant: "city" as const, hue: 268, seed: parseInt(id.slice(-6), 16) % 1000 });

export function storyView(db: Db, id: string, urls: MediaUrls): StoryView | null {
  const p = db.select().from(storyProjects).where(eq(storyProjects.id, id)).get();
  if (!p) return null;
  const clips = db.select().from(storyClips).where(eq(storyClips.projectId, id)).orderBy(asc(storyClips.position)).all();
  const session = p.sourceSessionId ? db.select().from(sessions).where(eq(sessions.id, p.sourceSessionId)).get() : undefined;
  // Candidates: the source session's open moments, else just the story's recordings.
  const recIds = session
    ? db.select({ id: recordings.id }).from(recordings).where(eq(recordings.sessionId, session.id)).all().map((r) => r.id)
    : [...new Set(clips.map((c) => c.recordingId))];
  const recRows = db.select().from(recordings).where(inArray(recordings.id, [...new Set([...recIds, ...clips.map((c) => c.recordingId)])])).all();
  const recs: Record<string, Recording> = {};
  const moments: Record<string, Moment> = {};
  for (const r of recRows) {
    const u = urls.get(r.id);
    recs[r.id] = {
      id: r.id,
      title: r.title,
      gameId: r.game ?? "",
      sessionId: r.sessionId,
      ownerLabel: "",
      recordedAt: r.recordedAt ?? 0,
      durationMs: r.durationMs ?? 0,
      width: r.width ?? 0,
      height: r.height ?? 0,
      fps: r.fps ?? 0,
      sizeBytes: r.sizeBytes ?? 0,
      container: r.container ?? "",
      art: ART(r.id),
      media: u?.videoUrl ? { kind: "video", src: u.videoUrl, poster: u.posterUrl ?? undefined } : { kind: "demo" },
      source: "library",
    };
    for (const m of listSuggestions(db, r.id)) {
      if (m.status === "dismissed") continue;
      moments[m.id] = {
        id: m.id,
        recordingId: r.id,
        startMs: m.startMs,
        endMs: m.endMs,
        title: m.title,
        kind: "highlight",
        score: m.score,
        caption: m.evidence.map((e) => `${e.label} — ${e.detail}`).join(" · "),
        transcript: m.speech.map((g) => ({ tMs: g.startMs, speaker: "Transcript", text: g.text })),
        audioPeak: null,
        tags: [],
        thumbUrl: m.thumbUrl ?? u?.posterUrl ?? undefined,
      };
    }
  }
  return {
    project: {
      id: p.id,
      title: p.title,
      aspect: p.aspect,
      captions: true,
      sourceSessionId: p.sourceSessionId,
      clips: clips.map((c) => ({ id: c.suggestionId ? `clip_${c.suggestionId}` : c.id, recordingId: c.recordingId, momentId: c.suggestionId, inMs: c.inMs, outMs: c.outMs, caption: c.caption })),
    },
    recordings: recs,
    moments,
    candidates: Object.values(moments).sort((a, b) => (recs[a.recordingId].recordedAt || 0) + a.startMs - ((recs[b.recordingId].recordedAt || 0) + b.startMs)),
    sourceSession: session ? { id: session.id, title: sessionTitle(db, session) } : null,
  };
}

export const isStoryId = (id: string) => /^sty_[0-9a-f]{16}$/.test(id);
