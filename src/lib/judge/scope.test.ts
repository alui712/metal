import { describe, expect, it } from "vitest";
import type { SessionDetail, TimelineMoment, TimelineRecording } from "@/lib/timemachine/types";
import { isJudge, judgeRecallScope, scopeSession, scopeStory } from "./scope";

const rec = (id: string, videoUrl: string | null = `/api/media/${id}/video`): TimelineRecording => ({
  id, title: id, origin: "upload", startAt: 0, timeSource: "metadata", durationMs: 10_000, posterUrl: null, videoUrl, analysis: "done", transcript: "done", momentCount: 1,
});
const moment = (id: string, recordingId: string): TimelineMoment => ({
  id, recordingId, startMs: 0, endMs: 5000, at: 0, title: id, confidence: "strong", evidence: [], speech: [], uncertainty: "", thumbUrl: null, favorite: false, saved: false,
});
const detail: SessionDetail = {
  summary: { id: "ses_1", title: "Saturday evening", titleIsCustom: false, game: null, startedAt: 0, endedAt: 1, timeKnown: true, approximate: false, locked: false, recordingCount: 3, footageMs: 30_000, momentCount: 3, favoriteCount: 0, transcriptLines: 44, analyzedCount: 3, coverUrl: "/api/frames/unapproved" },
  recordings: [rec("rec_a"), rec("rec_x"), rec("rec_broken", null)],
  moments: [moment("m1", "rec_a"), moment("m2", "rec_x"), moment("m3", "rec_broken")],
  others: [{ id: "ses_2", title: "Other night", startedAt: 0 }],
};
const allowed = new Set(["rec_a", "rec_broken"]);

describe("scopeSession", () => {
  it("keeps only approved, playable recordings and their moments, with counts and cover to match", () => {
    const s = scopeSession(detail, allowed, "/api/media/rec_a/poster");
    expect(s.recordings.map((r) => r.id)).toEqual(["rec_a"]);
    expect(s.moments.map((m) => m.id)).toEqual(["m1"]);
    expect(s.summary).toMatchObject({ recordingCount: 1, momentCount: 1, footageMs: 10_000, transcriptLines: 0, coverUrl: "/api/media/rec_a/poster" });
    expect(s.others).toEqual([]);
  });

  it("never falls back to the session's own cover", () => {
    expect(scopeSession(detail, allowed, null).summary.coverUrl).toBeNull();
  });
});

describe("scopeStory", () => {
  it("drops unapproved recordings, moments, candidates, exports and unapproved source sessions", () => {
    const v = {
      exports: [{ id: "exp_new" }, { id: "exp_ok" }, { id: "exp_old" }],
      recordings: { rec_a: {}, rec_x: {} },
      moments: { m1: { recordingId: "rec_a" }, m2: { recordingId: "rec_x" } },
      candidates: [{ recordingId: "rec_x" }, { recordingId: "rec_a" }],
      sourceSession: { id: "ses_9", title: "Test night" },
      extra: 1,
    };
    const s = scopeStory(v, allowed, "ses_1", ["exp_ok"]);
    expect(s.exports).toEqual([{ id: "exp_ok" }]);
    expect(Object.keys(s.recordings)).toEqual(["rec_a"]);
    expect(Object.keys(s.moments)).toEqual(["m1"]);
    expect(s.candidates).toEqual([{ recordingId: "rec_a" }]);
    expect(s.sourceSession).toBeNull();
    expect(s.extra).toBe(1);
    expect(scopeStory({ ...v, sourceSession: { id: "ses_1", title: "Saturday evening" } }, allowed, "ses_1", []).sourceSession).toEqual({ id: "ses_1", title: "Saturday evening" });
  });
});

describe("judgeRecallScope", () => {
  const p = (s: string) => new URLSearchParams(s);
  it("searches only the prepared, approved recording", () => {
    expect(judgeRecallScope(p("q=x&recording=rec_a&judge=1"), "rec_a", allowed)).toEqual({ recordingId: "rec_a" });
  });
  it("refuses other recordings, missing scope and extra filters instead of applying them", () => {
    expect(judgeRecallScope(p("q=x&recording=rec_x&judge=1"), "rec_a", allowed)).toHaveProperty("error");
    expect(judgeRecallScope(p("q=x&judge=1"), "rec_a", allowed)).toHaveProperty("error");
    expect(judgeRecallScope(p("q=x&recording=rec_a&game=Valorant"), "rec_a", allowed)).toHaveProperty("error");
    expect(judgeRecallScope(p("q=x&recording=rec_a&to=2026-01-01"), "rec_a", allowed)).toHaveProperty("error");
    expect(judgeRecallScope(p("q=x&recording=rec_a"), null, allowed)).toHaveProperty("error");
    expect(judgeRecallScope(p("q=x&recording=rec_z"), "rec_z", allowed)).toHaveProperty("error");
  });
});

describe("isJudge", () => {
  it("accepts only an explicit judge=1", () => {
    expect(isJudge("1")).toBe(true);
    expect(isJudge(["1"])).toBe(true);
    expect(isJudge("true")).toBe(false);
    expect(isJudge(undefined)).toBe(false);
  });
});
