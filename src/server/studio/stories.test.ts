import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client";
import { clipSuggestions, jobs, recordings, renderExports, storyClips, storyProjects } from "../db/schema";
import { trimBounds } from "@/lib/studio/seed";
import { syncSessions } from "../timemachine/sessions";
import { createStory, deleteStory, duplicateStory, listStories, renameStory, storyView } from "./stories";

const T = (s: string) => new Date(s).getTime();

describe("Time Machine → Story Studio handoff", () => {
  let db: Db;
  let sessionId: string;
  beforeEach(() => {
    db = openDb(":memory:");
    for (const [id, at] of [["rec_00000000000000a1", "2026-10-20T21:00"], ["rec_00000000000000b2", "2026-10-20T21:30"]] as const)
      db.insert(recordings).values({ id, title: id, originalPath: `${id}/o.mp4`, originalFilename: "x.mp4", status: "ready", durationMs: 600_000, recordedAt: T(at), recordedAtSource: "capture" }).run();
    const sug = (id: string, rec: string, start: number, end: number, status: "suggested" | "dismissed" = "suggested") =>
      db.insert(clipSuggestions).values({ id, recordingId: rec, eventStartMs: start, eventEndMs: start + 500, suggestedStartMs: start, suggestedEndMs: end, startMs: start, endMs: end, score: 0.5, confidence: "moderate", title: `Moment ${id.slice(-1)}`, evidenceJson: JSON.stringify({ focusMs: start, items: [] }), breakdownJson: "[]", status, analysisVersion: "t" }).run();
    sug("clp_00000000000000c1", "rec_00000000000000b2", 2_000, 14_500);
    sug("clp_00000000000000c2", "rec_00000000000000a1", 300_000, 312_250);
    sug("clp_00000000000000c3", "rec_00000000000000a1", 10_000, 21_000);
    sug("clp_00000000000000c4", "rec_00000000000000a1", 40_000, 50_000, "dismissed");
    syncSessions(db);
    sessionId = db.select({ s: recordings.sessionId }).from(recordings).where(eq(recordings.id, "rec_00000000000000a1")).get()!.s!;
  });

  it("stores real recording ids and exact boundaries, in the order things happened", () => {
    const r = createStory(db, { sessionId, momentIds: ["clp_00000000000000c1", "clp_00000000000000c2", "clp_00000000000000c3"] });
    if ("error" in r) throw new Error(r.error);
    const rows = db.select().from(storyClips).where(eq(storyClips.projectId, r.id)).all().sort((a, b) => a.position - b.position);
    expect(rows.map((c) => [c.recordingId, c.inMs, c.outMs, c.suggestionId])).toEqual([
      ["rec_00000000000000a1", 10_000, 21_000, "clp_00000000000000c3"],
      ["rec_00000000000000a1", 300_000, 312_250, "clp_00000000000000c2"],
      ["rec_00000000000000b2", 2_000, 14_500, "clp_00000000000000c1"],
    ]);
    const v = storyView(db, r.id, new Map([["rec_00000000000000a1", { posterUrl: "/p", videoUrl: "/api/media/rec_00000000000000a1/video" }]]))!;
    expect(v.project.clips.map((c) => [c.inMs, c.outMs])).toEqual([[10_000, 21_000], [300_000, 312_250], [2_000, 14_500]]);
    expect(v.recordings.rec_00000000000000a1.media).toEqual({ kind: "video", src: "/api/media/rec_00000000000000a1/video", poster: "/p" });
    expect(v.project.sourceSessionId).toBe(sessionId);
    expect(v.candidates.map((m) => m.id)).toEqual(["clp_00000000000000c3", "clp_00000000000000c2", "clp_00000000000000c1"]); // dismissed excluded
    // The Studio's EDL engine can trim against the real recordings.
    const b = trimBounds({ recording: (id) => v.recordings[id], moment: (id) => v.moments[id] }, v.project.clips);
    expect(b[v.project.clips[0].id]).toEqual({ minMs: 0, maxMs: 31_000 });
  });

  it("refuses empty, unknown, or dismissed moments", () => {
    expect(createStory(db, { sessionId, momentIds: [] })).toHaveProperty("error");
    expect(createStory(db, { sessionId, momentIds: ["clp_00000000000000c4"] })).toHaveProperty("error");
    expect(createStory(db, { sessionId, momentIds: ["clp_0000000000000099"] })).toHaveProperty("error");
  });

  it("renames and duplicates persisted projects without copying export history", () => {
    const made = createStory(db, { sessionId, momentIds: ["clp_00000000000000c3"], title: "Original" });
    if ("error" in made) throw new Error(made.error);
    expect(renameStory(db, made.id, "  Renamed night  ")).toMatchObject({ title: "Renamed night" });
    const copy = duplicateStory(db, made.id);
    if ("error" in copy) throw new Error(copy.error);
    const original = storyView(db, made.id, new Map())!;
    const duplicate = storyView(db, copy.id, new Map())!;
    expect(original.project.title).toBe("Renamed night");
    expect(duplicate.project).toMatchObject({ title: "Copy of Renamed night", aspect: original.project.aspect, captions: original.project.captions, framing: original.project.framing });
    expect(duplicate.project.clips.map((c) => [c.recordingId, c.inMs, c.outMs, c.caption])).toEqual(original.project.clips.map((c) => [c.recordingId, c.inMs, c.outMs, c.caption]));
    expect(db.select({ id: storyClips.id }).from(storyClips).where(eq(storyClips.projectId, copy.id)).get()!.id).not.toBe(
      db.select({ id: storyClips.id }).from(storyClips).where(eq(storyClips.projectId, made.id)).get()!.id,
    );
    expect(duplicate.exports).toEqual([]);
    const listed = listStories(db, new Map()).find((story) => story.id === copy.id)!;
    expect(listed.createdAt).toBeTypeOf("number");
    expect(listed.updatedAt).toBeTypeOf("number");
  });

  it("deletes only the project and refuses deletion while its export is active", () => {
    const made = createStory(db, { sessionId, momentIds: ["clp_00000000000000c3"] });
    if ("error" in made) throw new Error(made.error);
    const copy = duplicateStory(db, made.id);
    if ("error" in copy) throw new Error(copy.error);
    const jobId = "job_00000000000000d1";
    db.insert(jobs).values({ id: jobId, kind: "story-export", payloadJson: "{}", status: "queued" }).run();
    db.insert(renderExports).values({ id: "exp_00000000000000e1", projectId: copy.id, status: "queued", jobId }).run();
    expect(deleteStory(db, copy.id)).toMatchObject({ status: 409 });
    db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, jobId)).run();
    expect(deleteStory(db, copy.id)).toEqual({ ok: true });
    expect(db.select().from(storyProjects).where(eq(storyProjects.id, copy.id)).get()).toBeUndefined();
    expect(db.select().from(storyProjects).where(eq(storyProjects.id, made.id)).get()).toBeTruthy();
    expect(db.select().from(recordings).where(eq(recordings.id, "rec_00000000000000a1")).get()).toBeTruthy();
  });
});
