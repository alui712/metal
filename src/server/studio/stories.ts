import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { clipSuggestions, jobs, recordings, renderExports, sessions, storyClips, storyProjects } from "../db/schema";
import { newId } from "../ids";
import { enqueueJob } from "../jobs/queue";
import { listSuggestions } from "../smartclip/actions";
import { sessionTitle, type MediaUrls } from "../timemachine/sessions";
import type { Moment, Recording, StoryProject } from "@/lib/memory/contracts";
import { edlKey } from "@/lib/studio/edl";
import { checkSources, exportFile, isExportId, MAX_STORY_MS, type Edl } from "./render";

// Story projects on real recordings: created from Time Machine moments or
// Recall ranges, saved as the editor changes them, rendered by the worker.

export const MAX_STORY_CLIPS = 30;
const MIN_CLIP_MS = 1000;

type Range = { recordingId: string; inMs: number; outMs: number; caption?: string | null };

/** From Smart Clip moments (Time Machine) or raw ranges (Recall). Clips are ordered as they happened. */
export function createStory(
  db: Db,
  input: { sessionId: string | null; momentIds?: string[]; ranges?: Range[]; title?: string },
): { id: string } | { error: string } {
  const ids = [...new Set(input.momentIds ?? [])].slice(0, MAX_STORY_CLIPS);
  const rows: Array<{ recordingId: string; suggestionId: string | null; inMs: number; outMs: number; caption: string | null; at: number | null; given: number }> = [];
  if (ids.length) {
    const found = db
      .select({ s: clipSuggestions, at: recordings.recordedAt })
      .from(clipSuggestions)
      .innerJoin(recordings, eq(recordings.id, clipSuggestions.recordingId))
      .where(inArray(clipSuggestions.id, ids))
      .all()
      .filter((r) => r.s.status !== "dismissed");
    if (found.length !== ids.length) return { error: "Some of those moments no longer exist or were dismissed." };
    // Captions start as what was actually said in the moment (machine transcript), never an invented line.
    const speech = new Map<string, string>();
    for (const rid of new Set(found.map((r) => r.s.recordingId)))
      for (const v of listSuggestions(db, rid)) if (v.speech.length) speech.set(v.id, v.speech.map((g) => g.text).join(" ").slice(0, 200));
    for (const r of found) rows.push({ recordingId: r.s.recordingId, suggestionId: r.s.id, inMs: r.s.startMs, outMs: r.s.endMs, caption: speech.get(r.s.id) ?? null, at: r.at, given: ids.indexOf(r.s.id) });
  }
  for (const [i, g] of (input.ranges ?? []).slice(0, MAX_STORY_CLIPS).entries()) {
    const rec = db.select({ dur: recordings.durationMs, at: recordings.recordedAt, status: recordings.status }).from(recordings).where(eq(recordings.id, g.recordingId)).get();
    if (!rec || (rec.status !== "ready" && rec.status !== "analyzed")) return { error: "That recording isn’t available." };
    const inMs = Math.max(0, Math.round(g.inMs));
    const outMs = Math.min(rec.dur ?? 0, Math.round(g.outMs));
    if (outMs - inMs < MIN_CLIP_MS) return { error: "A clip must be at least 1 second long and inside the video." };
    rows.push({ recordingId: g.recordingId, suggestionId: null, inMs, outMs, caption: g.caption?.slice(0, 200) ?? null, at: rec.at, given: ids.length + i });
  }
  if (!rows.length) return { error: "Pick at least one moment." };
  if (rows.length > MAX_STORY_CLIPS) return { error: `A story can have at most ${MAX_STORY_CLIPS} clips.` };
  // Chronological by wall-clock time when both are known; otherwise keep the order given.
  rows.sort((a, b) => (a.at !== null && b.at !== null ? a.at + a.inMs - (b.at + b.inMs) : a.given - b.given));
  const session = input.sessionId ? db.select().from(sessions).where(eq(sessions.id, input.sessionId)).get() : undefined;
  const id = newId("sty");
  db.$client
    .transaction(() => {
      db.insert(storyProjects)
        .values({ id, title: (input.title?.trim() || (session ? sessionTitle(db, session) : "My story")).slice(0, 80), sourceSessionId: session?.id ?? null, updatedAt: Date.now() })
        .run();
      rows.forEach((r, i) =>
        db.insert(storyClips).values({ id: newId("stc"), projectId: id, position: i, recordingId: r.recordingId, suggestionId: r.suggestionId, inMs: r.inMs, outMs: r.outMs, caption: r.caption }).run(),
      );
    })
    .immediate();
  return { id };
}

export type SaveInput = {
  title: string;
  aspect: "16:9" | "9:16" | "1:1";
  framing: "fill" | "fit";
  captions: boolean;
  clips: Array<{ recordingId: string; suggestionId: string | null; inMs: number; outMs: number; caption: string | null }>;
};

/** Replaces the project's edit list. Every clip must point at an existing recording, inside its length. */
export function saveStory(db: Db, id: string, input: SaveInput): { updatedAt: number } | { error: string; status: number } {
  if (!db.select({ id: storyProjects.id }).from(storyProjects).where(eq(storyProjects.id, id)).get()) return { error: "Not found.", status: 404 };
  if (input.clips.length > MAX_STORY_CLIPS) return { error: `A story can have at most ${MAX_STORY_CLIPS} clips.`, status: 400 };
  const recIds = [...new Set(input.clips.map((c) => c.recordingId))];
  const recs = new Map((recIds.length ? db.select({ id: recordings.id, dur: recordings.durationMs }).from(recordings).where(inArray(recordings.id, recIds)).all() : []).map((r) => [r.id, r.dur ?? 0]));
  const sugIds = input.clips.flatMap((c) => (c.suggestionId ? [c.suggestionId] : []));
  const sugs = new Set(sugIds.length ? db.select({ id: clipSuggestions.id }).from(clipSuggestions).where(inArray(clipSuggestions.id, sugIds)).all().map((s) => s.id) : []);
  for (const [i, c] of input.clips.entries()) {
    const dur = recs.get(c.recordingId);
    if (dur === undefined) return { error: `Clip ${i + 1}: its source recording no longer exists. Remove it and try again.`, status: 409 };
    if (!(c.inMs >= 0 && c.outMs <= dur && c.outMs - c.inMs >= MIN_CLIP_MS)) return { error: `Clip ${i + 1} is outside its recording.`, status: 400 };
  }
  const updatedAt = Date.now();
  db.$client
    .transaction(() => {
      db.update(storyProjects)
        .set({ title: input.title.trim().slice(0, 80) || "My story", aspect: input.aspect, framing: input.framing, captions: input.captions, updatedAt })
        .where(eq(storyProjects.id, id))
        .run();
      db.delete(storyClips).where(eq(storyClips.projectId, id)).run();
      input.clips.forEach((c, i) =>
        db.insert(storyClips)
          .values({ id: newId("stc"), projectId: id, position: i, recordingId: c.recordingId, suggestionId: c.suggestionId && sugs.has(c.suggestionId) ? c.suggestionId : null, inMs: Math.round(c.inMs), outMs: Math.round(c.outMs), caption: c.caption?.slice(0, 200) || null })
          .run(),
      );
    })
    .immediate();
  return { updatedAt };
}

export function renameStory(db: Db, id: string, title: string): { title: string; updatedAt: number } | { error: string; status: number } {
  const project = db.select({ id: storyProjects.id }).from(storyProjects).where(eq(storyProjects.id, id)).get();
  if (!project) return { error: "Not found.", status: 404 };
  const nextTitle = title.trim().slice(0, 80) || "My story";
  const updatedAt = Date.now();
  db.update(storyProjects).set({ title: nextTitle, updatedAt }).where(eq(storyProjects.id, id)).run();
  return { title: nextTitle, updatedAt };
}

export function duplicateStory(db: Db, id: string): { id: string } | { error: string; status: number } {
  let result: { id: string } | { error: string; status: number } = { error: "Not found.", status: 404 };
  db.$client
    .transaction(() => {
      const project = db.select().from(storyProjects).where(eq(storyProjects.id, id)).get();
      if (!project) return;
      const clips = db.select().from(storyClips).where(eq(storyClips.projectId, id)).orderBy(asc(storyClips.position)).all();
      const duplicateId = newId("sty");
      const now = Date.now();
      const title = `Copy of ${project.title}`.slice(0, 80);
      db.insert(storyProjects)
        .values({
          id: duplicateId,
          title,
          aspect: project.aspect,
          sourceSessionId: project.sourceSessionId,
          captions: project.captions,
          framing: project.framing,
          updatedAt: now,
        })
        .run();
      clips.forEach((clip, position) => {
        db.insert(storyClips)
          .values({
            id: newId("stc"),
            projectId: duplicateId,
            position,
            recordingId: clip.recordingId,
            momentId: clip.momentId,
            suggestionId: clip.suggestionId,
            inMs: clip.inMs,
            outMs: clip.outMs,
            caption: clip.caption,
          })
          .run();
      });
      result = { id: duplicateId };
    })
    .immediate();
  return result;
}

type DeleteResult = { ok: true } | { error: string; status: number };

function removeOwnedExportFiles(id: string): void {
  if (!isExportId(id)) throw new Error("Invalid export id.");
  const output = exportFile(id);
  const files = [output, output.replace(/\.mp4$/, ".part.mp4"), output.replace(/\.mp4$/, ".srt"), ...Array.from({ length: MAX_STORY_CLIPS }, (_, i) => output.replace(/\.mp4$/, `.cap${i}.png`))];
  for (const file of files) {
    if (path.dirname(file) !== path.dirname(output)) throw new Error("Invalid export path.");
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (!stat.isFile()) throw new Error("Export storage contains an unexpected entry.");
    fs.rmSync(file);
  }
}

export function deleteExport(db: Db, id: string, projectId?: string): DeleteResult {
  let result: DeleteResult = { error: "Not found.", status: 404 };
  db.$client
    .transaction(() => {
      const row = db.select().from(renderExports).where(eq(renderExports.id, id)).get();
      if (!row || (projectId && row.projectId !== projectId)) return;
      const view = exportsFor(db, row.projectId).find((item) => item.id === id);
      if (view?.status === "queued" || view?.status === "rendering") {
        result = { error: "Wait for this export to finish before deleting it.", status: 409 };
        return;
      }
      try {
        removeOwnedExportFiles(id);
      } catch {
        result = { error: "The export file couldn’t be removed.", status: 500 };
        return;
      }
      db.delete(renderExports).where(eq(renderExports.id, id)).run();
      result = { ok: true };
    })
    .immediate();
  return result;
}

export function deleteStory(db: Db, id: string): DeleteResult {
  let result: DeleteResult = { error: "Not found.", status: 404 };
  db.$client
    .transaction(() => {
      if (!db.select({ id: storyProjects.id }).from(storyProjects).where(eq(storyProjects.id, id)).get()) return;
      const exports = exportsFor(db, id);
      if (exports.some((item) => item.status === "queued" || item.status === "rendering")) {
        result = { error: "Wait for this story’s export to finish before deleting it.", status: 409 };
        return;
      }
      try {
        for (const item of exports) removeOwnedExportFiles(item.id);
      } catch {
        result = { error: "One or more export files couldn’t be removed.", status: 500 };
        return;
      }
      db.delete(storyProjects).where(eq(storyProjects.id, id)).run();
      result = { ok: true };
    })
    .immediate();
  return result;
}

export type StoryListItem = { id: string; title: string; aspect: string; clipCount: number; durationMs: number; createdAt: number; updatedAt: number; coverUrl: string | null; lastExport: ExportView | null };

export function listStories(db: Db, urls: MediaUrls): StoryListItem[] {
  return db
    .select()
    .from(storyProjects)
    .orderBy(desc(storyProjects.updatedAt))
    .all()
    .map((p) => {
      const clips = db.select().from(storyClips).where(eq(storyClips.projectId, p.id)).orderBy(asc(storyClips.position)).all();
      const first = clips.find((c) => c.recordingId);
      return {
        id: p.id,
        title: p.title,
        aspect: p.aspect,
        clipCount: clips.length,
        durationMs: clips.reduce((a, c) => a + (c.outMs - c.inMs), 0),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        coverUrl: first?.recordingId ? (urls.get(first.recordingId)?.posterUrl ?? null) : null,
        lastExport: exportsFor(db, p.id, 1)[0] ?? null,
      };
    });
}

export type StoryView = {
  project: StoryProject;
  createdAt: number;
  updatedAt: number;
  recordings: Record<string, Recording>;
  moments: Record<string, Moment>;
  candidates: Moment[];
  sourceSession: { id: string; title: string } | null;
  /** Clips dropped on load because their source recording was deleted. */
  removedCount: number;
  /** Clips whose source can't be rendered right now (by clip id). */
  issues: Record<string, string>;
  exports: ExportView[];
};

const ART = (id: string) => ({ variant: "city" as const, hue: 268, seed: parseInt(id.slice(-6), 16) % 1000 });

export function storyView(db: Db, id: string, urls: MediaUrls): StoryView | null {
  const p = db.select().from(storyProjects).where(eq(storyProjects.id, id)).get();
  if (!p) return null;
  const all = db.select().from(storyClips).where(eq(storyClips.projectId, id)).orderBy(asc(storyClips.position)).all();
  const clips = all.filter((c): c is typeof c & { recordingId: string } => c.recordingId !== null);
  const session = p.sourceSessionId ? db.select().from(sessions).where(eq(sessions.id, p.sourceSessionId)).get() : undefined;
  // Candidates: the source session's open moments, plus the story's own recordings.
  const recIds = [
    ...new Set([...(session ? db.select({ id: recordings.id }).from(recordings).where(eq(recordings.sessionId, session.id)).all().map((r) => r.id) : []), ...clips.map((c) => c.recordingId)]),
  ];
  const recRows = recIds.length ? db.select().from(recordings).where(inArray(recordings.id, recIds)).all() : [];
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
  const { issues } = checkSources(db, clips);
  const at = (m: Moment) => (recs[m.recordingId].recordedAt || 0) + m.startMs;
  return {
    project: {
      id: p.id,
      title: p.title,
      aspect: p.aspect,
      captions: p.captions,
      framing: p.framing,
      sourceSessionId: p.sourceSessionId,
      // A clip from a moment keeps the "clip_<moment>" id the editor uses to know it's already added.
      clips: clips.map((c) => ({ id: c.suggestionId ? `clip_${c.suggestionId}` : c.id, recordingId: c.recordingId, momentId: c.suggestionId, inMs: c.inMs, outMs: c.outMs, caption: c.caption })),
    },
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    recordings: recs,
    moments,
    candidates: Object.values(moments).sort((a, b) => at(a) - at(b)),
    sourceSession: session ? { id: session.id, title: sessionTitle(db, session) } : null,
    removedCount: all.length - clips.length,
    issues: Object.fromEntries(issues.map((i) => [clips[i.index].suggestionId ? `clip_${clips[i.index].suggestionId}` : clips[i.index].id, i.reason])),
    exports: exportsFor(db, id),
  };
}

// ── Exports ─────────────────────────────────────────────────

export type ExportView = {
  id: string;
  status: "queued" | "rendering" | "done" | "failed";
  stage: string | null;
  progress: number;
  error: string | null;
  /** The edit list this export rendered, as a comparable key. */
  edlKey: string;
  aspect: string;
  clipCount: number;
  durationMs: number | null;
  sizeBytes: number | null;
  createdAt: number;
  finishedAt: number | null;
  fileUrl: string | null;
};


export function exportsFor(db: Db, projectId: string, limit = Number.POSITIVE_INFINITY): ExportView[] {
  return db
    .select({ e: renderExports, job: { status: jobs.status, stage: jobs.stage, progress: jobs.progress, error: jobs.error } })
    .from(renderExports)
    .leftJoin(jobs, eq(jobs.id, renderExports.jobId))
    .where(eq(renderExports.projectId, projectId))
    .orderBy(desc(renderExports.createdAt), desc(renderExports.id))
    .all()
    .slice(0, limit)
    .map(({ e, job }) => {
      const edl = e.edlJson ? (JSON.parse(e.edlJson) as Edl) : null;
      // Final states come from the export row; in-flight ones from the job (it survives worker restarts).
      const status: ExportView["status"] =
        e.status === "succeeded" ? "done" : e.status === "failed" || !job || job.status === "failed" ? "failed" : job.status === "running" ? "rendering" : "queued";
      return {
        id: e.id,
        status,
        stage: status === "rendering" ? job?.stage ?? null : null,
        progress: status === "done" ? 1 : status === "rendering" ? (job?.progress ?? 0) : 0,
        error: status === "failed" ? (e.error ?? job?.error ?? "Rendering stopped.") : status === "queued" ? e.error : null,
        edlKey: edl ? edlKey(edl) : "",
        aspect: edl?.aspect ?? "16:9",
        clipCount: edl?.clips.length ?? 0,
        durationMs: e.durationMs,
        sizeBytes: e.sizeBytes,
        createdAt: e.createdAt,
        finishedAt: e.finishedAt,
        fileUrl: status === "done" ? `/api/exports/${e.id}` : null,
      };
    });
}

/** Validates the saved project and queues one render. Refuses while another render of this story is in flight. */
export function requestExport(db: Db, projectId: string): { id: string } | { error: string; status: number } {
  let res: { id: string } | { error: string; status: number } = { error: "Not found.", status: 404 };
  db.$client
    .transaction(() => {
      const p = db.select().from(storyProjects).where(eq(storyProjects.id, projectId)).get();
      if (!p) return;
      const active = exportsFor(db, projectId).find((x) => x.status === "queued" || x.status === "rendering");
      if (active) {
        res = { error: "This story is already rendering.", status: 409 };
        return;
      }
      const clips = db.select().from(storyClips).where(eq(storyClips.projectId, projectId)).orderBy(asc(storyClips.position)).all();
      if (!clips.length) {
        res = { error: "Add at least one clip before exporting.", status: 409 };
        return;
      }
      const edl: Edl = {
        title: p.title,
        aspect: p.aspect,
        framing: p.framing,
        captions: p.captions,
        clips: clips.map((c) => ({ recordingId: c.recordingId, inMs: c.inMs, outMs: c.outMs, caption: c.caption })),
      };
      const { issues } = checkSources(db, edl.clips);
      if (issues.length) {
        res = { error: `Clip ${issues[0].index + 1}: ${issues[0].reason}`, status: 409 };
        return;
      }
      if (edl.clips.reduce((a, c) => a + c.outMs - c.inMs, 0) > MAX_STORY_MS) {
        res = { error: "Stories can be at most 30 minutes long.", status: 409 };
        return;
      }
      const id = newId("exp");
      db.insert(renderExports).values({ id, projectId, status: "queued", edlJson: JSON.stringify(edl) }).run();
      const job = enqueueJob(db, { kind: "story-export", payload: { exportId: id }, maxAttempts: 2 });
      db.update(renderExports).set({ jobId: job.id }).where(and(eq(renderExports.id, id))).run();
      res = { id };
    })
    .immediate();
  return res;
}

export const isStoryId = (id: string) => /^sty_[0-9a-f]{16}$/.test(id);
