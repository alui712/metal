import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client";
import { recordings, visualFrames } from "../db/schema";
import type { RecallHit, RecallSearch } from "./recall";
import { loadRecallTags, mergeTags, searchTags, tagKey, type RecallTag } from "./tags";

const REC = "rec_6520f3fcd3324fb8";
const OTHER = "rec_1297a2d0b54b411e";
const TAG: RecallTag = { recordingId: REC, startMs: 9000, endMs: 17_500, queries: ["pink gun with ace"], label: "pink pistol kills leading to the ACE banner at 0:16" };
let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  for (const id of [REC, OTHER]) db.insert(recordings).values({ id, title: id, originalPath: `${id}/o.mp4`, originalFilename: "o.mp4", status: "ready", durationMs: 21_119 }).run();
  for (const t of [0, 9066, 11_066, 13_066, 15_066, 19_166]) db.insert(visualFrames).values({ id: `vfr_${String(t).padStart(16, "0")}`, recordingId: REC, tMs: t, path: `${REC}/visual/${t}.jpg`, model: "m", embedding: Buffer.alloc(4) }).run();
});

describe("hand-curated Recall tags", () => {
  it("answer only their exact search (case, punctuation and spacing aside)", () => {
    for (const q of ["pink gun with ace", "Pink gun with ACE", "  pink gun, with ace! "]) expect(searchTags(db, q, {}, [TAG])).toHaveLength(1);
    for (const q of ["pink gun", "ace", "pink gun with an ace", "gun with ace", ""]) expect(searchTags(db, q, {}, [TAG])).toEqual([]);
    expect(tagKey(" Pink-gun  with ACE ")).toBe("pink gun with ace");
  });
  it("point at the real recording and time, labelled as tagged, with the recording's own frames as thumbnails", () => {
    const [h] = searchTags(db, "pink gun with ace", {}, [TAG]);
    expect(h).toMatchObject({ recordingId: REC, startMs: 9000, seekMs: 9000, endMs: 17_500, lines: [], sources: ["tag"], strength: "strong", reasons: ["Tagged by hand: pink pistol kills leading to the ACE banner at 0:16"] });
    expect(h.visual).toBeUndefined();
    expect(h.tag.frames.map((f) => f.tMs)).toEqual([9066, 11_066, 13_066]);
  });
  it("respect filters, so judge mode (one other recording) never sees them", () => {
    expect(searchTags(db, "pink gun with ace", { recordingId: OTHER }, [TAG])).toEqual([]);
    expect(searchTags(db, "pink gun with ace", { recordingId: REC }, [TAG])).toHaveLength(1);
    expect(searchTags(db, "pink gun with ace", { game: "Valorant" }, [TAG])).toEqual([]);
  });
  it("skip tags for recordings that no longer exist, and broken entries", () => {
    expect(searchTags(db, "pink gun with ace", {}, [{ ...TAG, recordingId: "rec_ffffffffffffffff" }])).toEqual([]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-tags-"));
    const file = path.join(dir, "recall-tags.json");
    fs.writeFileSync(file, JSON.stringify({ tags: [TAG, { ...TAG, endMs: 1 }, { recordingId: "x" }, { ...TAG, queries: [] }] }));
    expect(loadRecallTags(file)).toEqual([TAG]);
    expect(loadRecallTags(path.join(dir, "missing.json"))).toEqual([]);
    fs.writeFileSync(file, "{ not json");
    expect(loadRecallTags(file)).toEqual([]);
  });
});

describe("merging tags (pure)", () => {
  const base: RecallSearch = { query: "pink gun with ace", results: [], ambiguous: true, semantic: { available: true, reason: null } };
  const hit = (over: Partial<RecallHit>): RecallHit => ({ recordingId: REC, startMs: 8000, endMs: 10_000, seekMs: 8000, lines: [], sources: ["visual"], reasons: [], score: 0.4, strength: "weak", ...over });
  it("tag first; drops loose guesses and duplicates of the same stretch, so no 'no close matches'", () => {
    const [t] = searchTags(db, "pink gun with ace", {}, [TAG]);
    const m = mergeTags({ ...base, results: [hit({}), hit({ recordingId: OTHER, strength: "weak" }), hit({ recordingId: OTHER, strength: "good", startMs: 1000, endMs: 2000, sources: ["semantic"] }), hit({ strength: "good", startMs: 0, endMs: 0, sources: ["title"] })] }, [t]);
    expect(m.ambiguous).toBe(false);
    expect(m.results.map((r) => [r.recordingId, r.sources[0]])).toEqual([[REC, "tag"], [OTHER, "semantic"], [REC, "title"]]);
  });
  it("leaves searches without a tag untouched", () => {
    const s = { ...base, results: [hit({})] };
    expect(mergeTags(s, [])).toBe(s);
  });
});
