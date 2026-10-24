import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client";
import { chunks, recordings, transcriptSegments } from "../db/schema";
import { embedderStatus } from "./embed";
import { ensureEmbeddings, flagSegment, matchedTerms, parseQuery, recallIndexStats, searchRecall } from "./recall";

describe("query parsing (pure)", () => {
  it("drops stop words, keeps quoted phrases", () => {
    expect(parseQuery("when did we win the round").terms).toEqual(["win", "round"]);
    expect(parseQuery("we got the win").terms).toEqual(["win"]);
    expect(parseQuery('"left side"')).toMatchObject({ phrase: "left side", phraseRequired: true });
    expect(parseQuery("the").terms).toEqual(["the"]);
  });
  it("matches word forms for highlighting", () => {
    expect(matchedTerms("Two enemies on the stairs.", ["enemy", "stair"])).toEqual(["enemies", "stairs"]);
    expect(matchedTerms("Nice shot!", ["shots"])).toEqual(["shot"]);
    expect(matchedTerms("Nice shot!", ["pizza"])).toEqual([]);
  });
});

// Real transcript lines (whisper.cpp output from Phase 5C test recordings).
const DAY = (d: string) => new Date(`${d}T20:00:00`).getTime();
const REC = [
  { id: "rec_aaaaaaaaaaaaaaaa", title: "Voice chat night", game: "Valorant", recordedAt: DAY("2026-10-20"), lines: [[4200, 6900, "Okay, I'm rotating to B site."], [6940, 9920, "Two enemies on the stairs."], [22_200, 23_860, "Nice, I got one."], [23_880, 26_100, "He's low, finish him."]] },
  { id: "rec_bbbbbbbbbbbbbbbb", title: "Ranked push", game: "Valorant", recordedAt: DAY("2026-10-22"), lines: [[3049, 5234, "Ok team, push to the left side now."], [11_079, 11_742, "Nice shot!"], [12_600, 14_607, "That was the last one we won the round."]] },
  { id: "rec_cccccccccccccccc", title: "Desert drive", game: "Forza", recordedAt: DAY("2026-10-23"), lines: [[1000, 4000, "Watch the corner, brake early."]] },
] as const;

function seed(db: Db) {
  for (const r of REC) {
    db.insert(recordings).values({ id: r.id, title: r.title, game: r.game, recordedAt: r.recordedAt, originalPath: `${r.id}/original.mp4`, originalFilename: "x.mp4", status: "ready", durationMs: 60_000 }).run();
    r.lines.forEach(([s, e, text], i) => {
      const seg = `seg_${r.id.slice(4, 16)}${String(i).padStart(4, "0")}`;
      db.insert(transcriptSegments).values({ id: seg, recordingId: r.id, startMs: s, endMs: e, text }).run();
      db.insert(chunks).values({ id: `chk_${seg.slice(4)}`, recordingId: r.id, source: "transcript", sourceRefId: seg, startMs: s, endMs: e, text }).run();
    });
  }
}

const semanticReady = embedderStatus().available;

describe("Recall over real transcript rows", () => {
  let db: Db;
  beforeEach(async () => {
    db = openDb(":memory:");
    seed(db);
    if (semanticReady) expect(await ensureEmbeddings(db)).toBe(8);
  });

  it("finds an exact phrase at its real timestamp, with the source ids", async () => {
    const r = await searchRecall(db, "enemies on the stairs");
    expect(r.results[0]).toMatchObject({ recordingId: "rec_aaaaaaaaaaaaaaaa", seekMs: 6940, strength: "strong" });
    expect(r.results[0].sources).toContain("phrase");
    expect(r.results[0].lines[0]).toMatchObject({ text: "Two enemies on the stairs.", startMs: 6940, endMs: 9920 });
    expect(r.results[0].lines[0].segmentId).toMatch(/^seg_/);
    expect(r.results[0].reasons[0]).toBe("Exact phrase “enemies on the stairs”");
    // Quoted: phrase required.
    const quoted = await searchRecall(db, '"left side"');
    expect(quoted.results.map((h) => [h.recordingId, h.seekMs])).toEqual([["rec_bbbbbbbbbbbbbbbb", 3049]]);
  });

  it("finds keywords across recordings and highlights the matched words", async () => {
    const r = await searchRecall(db, "nice");
    const ids = r.results.map((h) => h.recordingId);
    expect(ids).toEqual(expect.arrayContaining(["rec_aaaaaaaaaaaaaaaa", "rec_bbbbbbbbbbbbbbbb"]));
    expect(r.results.every((h) => h.lines.every((l) => l.matched.includes("nice")))).toBe(true);
  });

  it.skipIf(!semanticReady)("finds paraphrases by meaning (no shared words)", async () => {
    const r = await searchRecall(db, "enemy spotted on the staircase");
    expect(r.results[0]).toMatchObject({ recordingId: "rec_aaaaaaaaaaaaaaaa", seekMs: 6940 });
    expect(r.results[0].reasons.join()).toMatch(/Similar meaning \(similarity 0\.\d\d\)/);
    const won = await searchRecall(db, "we got the win");
    expect(won.results[0]).toMatchObject({ recordingId: "rec_bbbbbbbbbbbbbbbb", seekMs: 12_600 });
    const left = await searchRecall(db, "go left");
    expect(left.results[0].seekMs).toBe(3049);
  });

  it.skipIf(!semanticReady)("marks loose-only results as ambiguous, and hides them when a confident match exists", async () => {
    const corner = await searchRecall(db, "corner");
    expect(corner.results.map((h) => h.recordingId)).toEqual(["rec_cccccccccccccccc"]);
    expect(corner.ambiguous).toBe(false);
    const v = await searchRecall(db, "victory");
    if (v.results.length) {
      expect(v.ambiguous).toBe(true);
      expect(v.results.every((h) => h.strength === "weak")).toBe(true);
    }
  });

  it("returns nothing for unrelated queries instead of guessing", async () => {
    for (const q of ["pizza recipe", "baking bread", "zzqx"]) {
      const r = await searchRecall(db, q);
      expect(r.results, q).toEqual([]);
    }
    expect((await searchRecall(db, "   ")).results).toEqual([]);
  });

  it("excludes lines the user flagged as wrong, and restores them", async () => {
    const seg = (await searchRecall(db, "finish him")).results[0].lines.find((l) => /finish/.test(l.text))!.segmentId;
    expect(flagSegment(db, seg, true)).toBe(true);
    expect((await searchRecall(db, '"finish him"')).results).toEqual([]);
    expect(recallIndexStats(db)).toMatchObject({ segments: 7, flagged: 1 });
    flagSegment(db, seg, false);
    if (semanticReady) await ensureEmbeddings(db);
    expect((await searchRecall(db, '"finish him"')).results[0].seekMs).toBe(23_880);
  });

  it("filters by recording, game and date", async () => {
    expect((await searchRecall(db, "nice", { recordingId: "rec_bbbbbbbbbbbbbbbb" })).results.map((h) => h.recordingId)).toEqual(["rec_bbbbbbbbbbbbbbbb"]);
    // The only "corner" line is in Forza: within Valorant, at most loose (labeled) matches remain.
    const val = await searchRecall(db, "corner", { game: "Valorant" });
    expect(val.results.every((h) => h.strength === "weak" && h.recordingId !== "rec_cccccccccccccccc")).toBe(true);
    if (val.results.length) expect(val.ambiguous).toBe(true);
    expect((await searchRecall(db, "corner", { game: "Forza" })).results[0].recordingId).toBe("rec_cccccccccccccccc");
    const after = await searchRecall(db, "nice", { fromMs: DAY("2026-10-21") - 72_000_000 });
    expect(after.results.map((h) => h.recordingId)).toEqual(["rec_bbbbbbbbbbbbbbbb"]);
  });

  it("groups nearby lines into one moment and matches recording names", async () => {
    const r = await searchRecall(db, "nice got one low finish");
    const voice = r.results.find((h) => h.recordingId === "rec_aaaaaaaaaaaaaaaa")!;
    expect(voice.lines.map((l) => l.startMs)).toEqual([22_200, 23_880]);
    expect(voice.seekMs).toBe(22_200);
    const t = await searchRecall(db, "desert drive");
    expect(t.results.find((h) => h.sources.includes("title"))).toMatchObject({ recordingId: "rec_cccccccccccccccc", seekMs: 0, lines: [] });
  });

  describe("without the embedding model", () => {
    const prev = process.env.EMBED_MODEL_DIR;
    beforeEach(() => {
      process.env.EMBED_MODEL_DIR = "/nonexistent-metal-models";
    });
    afterEach(() => {
      if (prev === undefined) delete process.env.EMBED_MODEL_DIR;
      else process.env.EMBED_MODEL_DIR = prev;
    });
    it("falls back to keywords and says so", async () => {
      const r = await searchRecall(db, "enemies stairs");
      expect(r.semantic).toMatchObject({ available: false, reason: expect.stringMatching(/not found/) });
      expect(r.results[0]).toMatchObject({ seekMs: 6940 });
      expect(r.results[0].sources).toEqual(["keyword"]);
      expect((await searchRecall(db, "enemy spotted on the staircase")).results[0]?.seekMs).toBe(6940); // "enemy" / "stair" stems still match
    });
  });
});
