import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client";
import { recordings } from "../db/schema";
import type { RecallHit, RecallSearch } from "./recall";
import { demoteGenericSpeech, mergeGames, searchGames } from "./games";

const REC = [
  { id: "rec_aaaaaaaaaaaaaaaa", title: "CTnULlxyHo", game: "Valorant" },
  { id: "rec_bbbbbbbbbbbbbbbb", title: "dGNmEv3", game: "Valorant" },
  { id: "rec_cccccccccccccccc", title: "rivals", game: "Marvel Rivals" },
  { id: "rec_dddddddddddddddd", title: "peak pov", game: "PEAK" },
  { id: "rec_eeeeeeeeeeeeeeee", title: "backrooms", game: null },
  { id: "rec_ffffffffffffffff", title: "drg", game: "Deep Rock Galactic" },
];
let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  for (const r of REC) db.insert(recordings).values({ ...r, originalPath: `${r.id}/o.mp4`, originalFilename: "o.mp4", status: "ready", durationMs: 20_000 }).run();
});
const ids = (q: string, f = {}) => searchGames(db, q, f).hits.map((h) => h.recordingId).sort();

describe("Recall by game and genre", () => {
  it("genre searches return recordings whose set game is in that genre, as whole recordings", () => {
    for (const q of ["first person shooter", "FPS", "fps games"]) expect(ids(q)).toEqual(["rec_aaaaaaaaaaaaaaaa", "rec_bbbbbbbbbbbbbbbb"]);
    expect(ids("shooter game")).toEqual(["rec_aaaaaaaaaaaaaaaa", "rec_bbbbbbbbbbbbbbbb", "rec_cccccccccccccccc"]);
    const h = searchGames(db, "first person shooter", {}).hits[0];
    expect(h).toMatchObject({ startMs: 0, endMs: 0, seekMs: 0, lines: [], sources: ["game"], strength: "good" });
    expect(h.visual).toBeUndefined();
    expect(h.reasons[0]).toBe("Game: Valorant (set on this recording) — a first-person shooter in METAL’s game list");
  });
  it("game names match the set game, including games outside the list", () => {
    expect(ids("Valorant")).toEqual(["rec_aaaaaaaaaaaaaaaa", "rec_bbbbbbbbbbbbbbbb"]);
    expect(ids("deep rock galactic")).toEqual(["rec_ffffffffffffffff"]);
    expect(searchGames(db, "Valorant", {}).hits[0].reasons).toEqual(["Game: Valorant (set on this recording)"]);
  });
  it("never matches a recording without a game, or scene and speech searches", () => {
    for (const q of ["jungle cliff", "rocky cliff", "a dark hallway with a monster", "underwater", "farming game", "snow", "Did that bug just die?"]) expect(ids(q)).toEqual([]);
    expect(ids("first person shooter")).not.toContain("rec_eeeeeeeeeeeeeeee");
  });
  it("a game plus more words is only a loose match, and says what wasn't confirmed", () => {
    const [h] = searchGames(db, "first person shooter on a sunny sandstone street", {}).hits;
    expect(h.strength).toBe("weak");
    expect(h.reasons[1]).toBe("Only the game matched — nothing here confirms “sunny sandstone street”");
  });
  it("respects the recording filter (judge mode) and the game filter", () => {
    expect(ids("first person shooter", { recordingId: "rec_eeeeeeeeeeeeeeee" })).toEqual([]);
    expect(ids("first person shooter", { recordingId: "rec_bbbbbbbbbbbbbbbb" })).toEqual(["rec_bbbbbbbbbbbbbbbb"]);
    expect(ids("shooter", { game: "Marvel Rivals" })).toEqual(["rec_cccccccccccccccc"]);
  });
  it("reports what was asked and how many recordings have a game, for empty states", () => {
    expect(searchGames(db, "FPS", {}).status).toEqual({ genres: ["first-person shooter"], games: [], rest: "", tagged: 5 });
  });
});

describe("merging game matches (pure)", () => {
  const base: RecallSearch = { query: "FPS", results: [], ambiguous: false, semantic: { available: true, reason: null } };
  const scene: RecallHit = { recordingId: "rec_bbbbbbbbbbbbbbbb", startMs: 9000, endMs: 11000, seekMs: 9000, lines: [], sources: ["visual"], reasons: ["Looks similar"], score: 0.52, strength: "good" };
  const game = (id: string, strength: RecallHit["strength"] = "good"): RecallHit => ({ recordingId: id, startMs: 0, endMs: 0, seekMs: 0, lines: [], sources: ["game"], reasons: ["Game: Valorant (set on this recording)"], score: 0.58, strength });
  it("adds the game to a recording's existing moment instead of duplicating it", () => {
    const m = mergeGames({ ...base, results: [scene] }, [game("rec_aaaaaaaaaaaaaaaa"), game("rec_bbbbbbbbbbbbbbbb")]);
    expect(m.results).toHaveLength(2);
    expect(m.results[0]).toMatchObject({ recordingId: "rec_bbbbbbbbbbbbbbbb", startMs: 9000, sources: ["visual", "game"], score: 0.62 });
    expect(m.results[1]).toMatchObject({ recordingId: "rec_aaaaaaaaaaaaaaaa", sources: ["game"] });
  });
  it("loose game matches don't push out confident results", () => {
    const m = mergeGames({ ...base, results: [{ ...scene, recordingId: "rec_eeeeeeeeeeeeeeee" }] }, [game("rec_aaaaaaaaaaaaaaaa", "weak")]);
    expect(m.results.map((r) => r.recordingId)).toEqual(["rec_eeeeeeeeeeeeeeee"]);
    expect(mergeGames(base, [game("rec_aaaaaaaaaaaaaaaa", "weak")])).toMatchObject({ ambiguous: true, results: [{ recordingId: "rec_aaaaaaaaaaaaaaaa" }] });
  });
});

describe("generic speech in game searches (pure)", () => {
  const line = (text: string, matched: string[]) => ({ segmentId: "seg_0000000000000001", startMs: 30_160, endMs: 33_000, text, matched });
  const speech = (sources: RecallHit["sources"], text: string, matched: string[]): RecallHit => ({ recordingId: "rec_eeeeeeeeeeeeeeee", startMs: 30_160, endMs: 33_000, seekMs: 30_160, lines: [line(text, matched)], sources, reasons: [], score: 0.6, strength: "good" });
  const s = (results: RecallHit[]): RecallSearch => ({ query: "shooter game", results, ambiguous: false, semantic: { available: true, reason: null } });
  const status = (q: string) => searchGames(db, q, {}).status;
  it("a line that only matched “game” is loose in a genre search", () => {
    const [h] = demoteGenericSpeech(s([speech(["keyword"], "Good game everyone, that was a really close match.", ["game"])]), status("shooter game")).results;
    expect(h.strength).toBe("weak");
    expect(h.reasons.at(-1)).toBe("Only the common word “game” was said — not the game");
  });
  it("keeps lines that name the game, match by meaning or phrase, and every non-game search", () => {
    const named = speech(["keyword"], "Let's queue Valorant", ["valorant"]);
    expect(demoteGenericSpeech(s([named]), status("Valorant")).results[0].strength).toBe("good");
    const meaning = speech(["keyword", "semantic"], "Good game everyone", ["game"]);
    expect(demoteGenericSpeech(s([meaning]), status("shooter game")).results[0].strength).toBe("good");
    const gg = speech(["keyword"], "Good game everyone", ["game"]);
    for (const q of ["good game", "farming game", "first person shooter on a sunny street"]) expect(demoteGenericSpeech(s([gg]), status(q)).results[0].strength).toBe("good");
  });
});
