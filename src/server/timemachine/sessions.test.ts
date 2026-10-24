import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client";
import { clipSuggestions, recordings, sessions } from "../db/schema";
import { resolveRecordedAt, timeFromFilename } from "../media/recorded-time";
import { clusterRecordings, derivedTitle, editSession, sessionDetail, setGapMinutes, syncSessions, timeMachineOverview } from "./sessions";

const T = (s: string) => new Date(s).getTime();
const MIN = 60_000;

describe("recording time evidence (pure)", () => {
  it("reads recorder timestamps from file names", () => {
    expect(timeFromFilename("2026-10-24 00-53-20.mkv")).toBe(T("2026-10-24T00:53:20"));
    expect(timeFromFilename("20261024_005320.mp4")).toBe(T("2026-10-24T00:53:20"));
    // Replay buffer names mark the save: the clip started `duration` earlier.
    expect(timeFromFilename("Replay 2026-10-22 21-04-11.mkv", 30_000)).toBe(T("2026-10-22T21:03:41"));
    expect(timeFromFilename("Night 1 - clutch.mp4")).toBeNull();
    expect(timeFromFilename("2026-13-40 99-99-99.mp4")).toBeNull();
  });
  it("prefers the file name, then metadata, and never invents a time", () => {
    const none = { at: null, source: null };
    expect(resolveRecordedAt({ filename: "2026-10-24 00-53-20.mkv", durationMs: 1, metadataMs: T("2026-01-01"), current: none })).toEqual({ at: T("2026-10-24T00:53:20"), source: "filename" });
    expect(resolveRecordedAt({ filename: "clip.mp4", durationMs: 1, metadataMs: T("2026-01-01"), current: none })).toEqual({ at: T("2026-01-01"), source: "metadata" });
    expect(resolveRecordedAt({ filename: "clip.mp4", durationMs: 1, metadataMs: null, current: none })).toEqual(none);
    expect(resolveRecordedAt({ filename: "clip.mp4", durationMs: 1, metadataMs: null, current: { at: 5, source: "file-date" } })).toEqual(none); // implausible
  });
});

describe("clustering (pure)", () => {
  const it_ = (id: string, start: string, durMin: number, game: string | null = null) => ({ id, startMs: T(start), endMs: T(start) + durMin * MIN, game });
  it("splits on gaps longer than the setting, measured from the previous end", () => {
    const g = clusterRecordings([it_("c", "2026-10-20T21:50", 5), it_("a", "2026-10-20T21:00", 30), it_("d", "2026-10-21T20:00", 10), it_("b", "2026-10-20T21:40", 2)], 45 * MIN);
    expect(g.map((x) => x.map((i) => i.id))).toEqual([["a", "b", "c"], ["d"]]);
    expect(clusterRecordings([it_("a", "2026-10-20T21:00", 30), it_("b", "2026-10-20T22:00", 1)], 15 * MIN).length).toBe(2);
  });
  it("starts a new session when a known game changes", () => {
    const g = clusterRecordings([it_("a", "2026-10-20T21:00", 5, "Valorant"), it_("b", "2026-10-20T21:10", 5, null), it_("c", "2026-10-20T21:20", 5, "Forza")], 45 * MIN);
    expect(g.map((x) => x.map((i) => i.id))).toEqual([["a", "b"], ["c"]]);
  });
  it("titles sessions factually, counting after-midnight as the night before", () => {
    const wd = (s: string) => new Date(s).toLocaleDateString("en-US", { weekday: "long" });
    expect(derivedTitle(T("2026-10-24T00:53"), null)).toBe(`${wd("2026-10-23T12:00")} night`); // 00:53 belongs to the night before
    expect(derivedTitle(T("2026-10-24T19:00"), "Valorant")).toBe(`Valorant · ${wd("2026-10-24T12:00")} evening`);
  });
});

describe("sessions over real rows", () => {
  let db: Db;
  const add = (id: string, opts: { at?: string | null; dur?: number; game?: string; name?: string; origin?: "upload" | "clip" | "obs-replay"; source?: "file-date" | "capture" }) =>
    db
      .insert(recordings)
      .values({
        id,
        title: id,
        originalPath: `${id}/o.mp4`,
        originalFilename: opts.name ?? `${id}.mp4`,
        status: "ready",
        durationMs: (opts.dur ?? 1) * MIN,
        recordedAt: opts.at ? T(opts.at) : null,
        recordedAtSource: opts.at ? (opts.source ?? "capture") : null,
        game: opts.game ?? null,
        origin: opts.origin ?? "upload",
      })
      .run();
  const ids = (sid: string | null) => db.select({ id: recordings.id }).from(recordings).where(sid ? eq(recordings.sessionId, sid) : eq(recordings.sessionLocked, false)).all().map((r) => r.id).sort();
  const sessionOf = (rid: string) => db.select({ s: recordings.sessionId }).from(recordings).where(eq(recordings.id, rid)).get()!.s;
  const urls = new Map();

  beforeEach(() => {
    db = openDb(":memory:");
    add("rec_000000000000000a", { at: "2026-10-20T21:00", dur: 20 });
    add("rec_000000000000000b", { at: "2026-10-20T21:40", dur: 5 }); // 20 min after a ends
    add("rec_000000000000000c", { at: "2026-10-22T19:00", dur: 3, source: "file-date" });
    add("rec_000000000000000d", { at: null }); // unknown time
    add("rec_000000000000000e", { at: null, name: "Replay 2026-10-23 22-00-30.mkv", dur: 0.5, origin: "obs-replay" }); // time in the name
    add("rec_000000000000000f", { at: "2026-10-20T21:05", origin: "clip" }); // saved clip: never its own session
    syncSessions(db);
  });

  it("groups multiple nights, keeps single-recording sessions, and leaves unknown times out", () => {
    const o = timeMachineOverview(db, urls);
    expect(o.sessions).toHaveLength(3);
    const [latest, mid, first] = o.sessions;
    expect(first).toMatchObject({ recordingCount: 2, approximate: false });
    expect(first.title).toMatch(/ night$/);
    expect(mid).toMatchObject({ recordingCount: 1, approximate: true }); // file date only
    expect(latest.startedAt).toBe(T("2026-10-23T22:00:00")); // from the replay's file name (save − duration)
    expect(o.undated.map((r) => r.id)).toEqual(["rec_000000000000000d"]);
    expect(sessionOf("rec_000000000000000f")).toBeNull();
  });

  it("is stable: re-syncing changes nothing", () => {
    const before = db.select().from(recordings).all().map((r) => [r.id, r.sessionId]);
    syncSessions(db);
    syncSessions(db);
    expect(db.select().from(recordings).all().map((r) => [r.id, r.sessionId])).toEqual(before);
  });

  it("respects the configurable gap", () => {
    expect(setGapMinutes(db, 15)).toBe(true);
    expect(sessionOf("rec_000000000000000a")).not.toBe(sessionOf("rec_000000000000000b"));
    setGapMinutes(db, 45);
    expect(sessionOf("rec_000000000000000a")).toBe(sessionOf("rec_000000000000000b"));
    expect(setGapMinutes(db, 7)).toBe(false);
  });

  it("persists manual edits through regrouping: move, rename, split, merge, reset", () => {
    const night = sessionOf("rec_000000000000000a")!;
    const other = sessionOf("rec_000000000000000c")!;
    // Move an undated recording into a session (allowed; its time stays unknown).
    expect(editSession(db, "none", { action: "move", recordingId: "rec_000000000000000d", to: night })).toBeNull();
    expect(editSession(db, night, { action: "rename", title: "Ranked with friends" })).toBeNull();
    syncSessions(db);
    setGapMinutes(db, 15); // would split a/b if automatic
    expect(ids(night)).toEqual(["rec_000000000000000a", "rec_000000000000000b", "rec_000000000000000d"]);
    expect(sessionDetail(db, night, urls)!.summary).toMatchObject({ title: "Ranked with friends", titleIsCustom: true, locked: true, approximate: true });
    // Split, then merge back.
    expect(editSession(db, night, { action: "split", atRecordingId: "rec_000000000000000b" })).toBeNull();
    const tail = sessionOf("rec_000000000000000b")!;
    expect(tail).not.toBe(night);
    expect(ids(tail)).toEqual(["rec_000000000000000b", "rec_000000000000000d"]);
    expect(editSession(db, tail, { action: "merge", into: other })).toBeNull();
    expect(ids(other)).toEqual(["rec_000000000000000b", "rec_000000000000000c", "rec_000000000000000d"]);
    expect(db.select().from(sessions).where(eq(sessions.id, tail)).get()).toBeUndefined();
    // Reset returns a session to automatic grouping.
    expect(editSession(db, other, { action: "reset" })).toBeNull();
    expect(sessionOf("rec_000000000000000d")).toBeNull();
    expect(editSession(db, other, { action: "split", atRecordingId: "rec_000000000000000c" })).not.toBeNull();
  });

  it("never invents a time for a session of undated recordings", () => {
    expect(editSession(db, "none", { action: "move", recordingId: "rec_000000000000000d", to: "new" })).toBeNull();
    const sid = sessionOf("rec_000000000000000d")!;
    expect(sessionDetail(db, sid, urls)!.summary).toMatchObject({ title: "Session with unknown dates", timeKnown: false, approximate: true });
    expect(editSession(db, sid, { action: "reset" })).toBeNull(); // back to the tray
    expect(sessionOf("rec_000000000000000d")).toBeNull();
    expect(db.select().from(sessions).where(eq(sessions.id, sid)).get()).toBeUndefined();
  });

  it("lists Smart Clip moments chronologically without duplicates, with favorites", () => {
    const night = sessionOf("rec_000000000000000a")!;
    const sug = (id: string, rec: string, start: number, status: "suggested" | "dismissed" = "suggested", fav = false) =>
      db.insert(clipSuggestions).values({ id, recordingId: rec, eventStartMs: start, eventEndMs: start + 1000, suggestedStartMs: start, suggestedEndMs: start + 10_000, startMs: start, endMs: start + 10_000, score: 0.8, confidence: "moderate", title: `Loud moment`, evidenceJson: JSON.stringify({ focusMs: start, items: [] }), breakdownJson: "[]", status, analysisVersion: "t", favoriteAt: fav ? 1 : null }).run();
    sug("clp_0000000000000003", "rec_000000000000000b", 1000);
    sug("clp_0000000000000001", "rec_000000000000000a", 90_000, "suggested", true);
    sug("clp_0000000000000002", "rec_000000000000000a", 5000);
    sug("clp_0000000000000004", "rec_000000000000000a", 50_000, "dismissed");
    const d = sessionDetail(db, night, urls)!;
    expect(d.moments.map((m) => m.id)).toEqual(["clp_0000000000000002", "clp_0000000000000001", "clp_0000000000000003"]);
    expect(d.moments.map((m) => m.at)).toEqual([T("2026-10-20T21:00") + 5000, T("2026-10-20T21:00") + 90_000, T("2026-10-20T21:40") + 1000]);
    expect(d.summary).toMatchObject({ momentCount: 3, favoriteCount: 1 });
  });
});
