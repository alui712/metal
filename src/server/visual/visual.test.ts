import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RecallSearch } from "../search/recall";
import { visualModelStatus } from "./clip";
import { parseShowinfo, samplingFilter, samplingInterval } from "./indexer";
import { capForEvents, describeScene, groupVisual, isEventQuery, mergeRecall, SCENE_PROMPTS, VISUAL_RULES } from "./search";

describe("frame sampling (pure)", () => {
  it("reads exact frame times from showinfo, shifted to file time", () => {
    const log = [
      "[Parsed_showinfo_2 @ 0xb7b0421c0] n:   0 pts:      0 pts_time:0       duration:512",
      "[Parsed_showinfo_2 @ 0xb7b0421c0] n:   1 pts:  30720 pts_time:2.0333  duration:512",
      "[Parsed_showinfo_2 @ 0xb7b0421c0] config in time_base: 1/15360",
      "[Parsed_showinfo_2 @ 0xb7b0421c0] n:   2 pts:  61440 pts_time:5.1",
    ].join("\n");
    expect(parseShowinfo(log)).toEqual([0, 2033, 5100]);
    expect(parseShowinfo(log, 1000)).toEqual([0, 1033, 4100]);
  });
  it("samples every 2 s, spacing out only for very long recordings", () => {
    expect(samplingInterval(60_000)).toBe(2000);
    expect(samplingInterval(3_600_000)).toBe(2000);
    expect(samplingInterval(7_200_000)).toBe(4000);
    expect(samplingFilter(2000)).toContain("gte(t-prev_selected_t\\,2.000)");
  });
});

const row = (recordingId: string, tMs: number) => ({ id: `vfr_${String(tMs).padStart(16, "0")}`, recordingId, tMs, embedding: Buffer.alloc(0), model: "clip", intervalMs: 2000 });
const A = "rec_aaaaaaaaaaaaaaaa";
const B = "rec_bbbbbbbbbbbbbbbb";

describe("visual grouping and confidence (pure)", () => {
  it("groups nearby matching frames into one approximate moment around real frame times", () => {
    const L = VISUAL_RULES.likelyMin;
    const hits = groupVisual(
      [
        { row: row(A, 10_000), sim: L + 0.025 },
        { row: row(A, 12_000), sim: L + 0.03 },
        { row: row(A, 14_000), sim: 0.2 }, // below the floor: not evidence
        { row: row(A, 24_000), sim: L + 0.005 }, // above the floor but far below this recording's peak
        { row: row(A, 40_000), sim: L + 0.022 },
      ],
      new Map([[A, 60_000]]),
    );
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ recordingId: A, startMs: 9000, endMs: 13_000, seekMs: 9000, strength: "good", sources: ["visual"], lines: [] });
    expect(hits[0].visual).toMatchObject({ confidence: "likely", similarity: Math.round((L + 0.03) * 1000) / 1000 });
    expect(hits[0].visual.frames.map((f) => f.tMs)).toEqual([12_000, 10_000]);
  });
  it("shows only a few low-confidence moments, and only when nothing is likely", () => {
    // The calibrated rules have no low band (possibleMin = likelyMin); test the mechanism with one.
    const saved = VISUAL_RULES.possibleMin;
    VISUAL_RULES.possibleMin = VISUAL_RULES.likelyMin - 0.03;
    try {
      const low = [0, 10, 20, 30, 40].map((s) => ({ row: row(B, s * 1000), sim: VISUAL_RULES.possibleMin + 0.01 }));
      const lowHits = groupVisual(low, new Map());
      expect(lowHits).toHaveLength(VISUAL_RULES.maxLowConfidence);
      expect(lowHits.every((h) => h.visual.confidence === "low" && h.strength === "weak")).toBe(true);
      const mixed = groupVisual([...low, { row: row(A, 5000), sim: VISUAL_RULES.likelyMin + 0.02 }], new Map());
      expect(mixed.map((h) => h.recordingId)).toEqual([A]);
    } finally {
      VISUAL_RULES.possibleMin = saved;
    }
  });
  it("puts every query through the same caption-style prompts", () => {
    expect(SCENE_PROMPTS.length).toBeGreaterThan(1);
    expect(SCENE_PROMPTS.every((p) => p.includes("{}"))).toBe(true);
    expect(VISUAL_RULES.possibleMin).toBeLessThanOrEqual(VISUAL_RULES.likelyMin);
  });
  it("turns search requests into scene descriptions", () => {
    expect(describeScene("Find when I was holding a sniper")).toBe("holding a sniper");
    expect(describeScene("Show me the dark room with my teammates")).toBe("dark room with my teammates");
    expect(describeScene("Find the scene where an enemy appeared")).toBe("an enemy appeared");
    expect(describeScene("where was the boss fight?")).toBe("boss fight");
    expect(describeScene("a dark hallway")).toBe("a dark hallway");
  });
  it("never lets event queries look confident", () => {
    for (const q of ["an ace", "when I got a kill", "my teammate died", "a 4k", "the clutch round", "when we won the round", "a headshot"]) expect(isEventQuery(q)).toBe(true);
    for (const q of ["a dark hallway", "a pink knife skin", "a face in the window", "a cozy kitchen", "a snowy mountain"]) expect(isEventQuery(q)).toBe(false);
    const hits = capForEvents(groupVisual([0, 10, 20, 30, 40].map((s) => ({ row: row(A, s * 1000), sim: VISUAL_RULES.likelyMin + 0.01 })), new Map()));
    expect(hits).toHaveLength(VISUAL_RULES.maxLowConfidence);
    expect(hits.every((h) => h.visual.confidence === "low" && h.strength === "weak" && h.reasons.at(-1)!.includes("can’t recognise game events"))).toBe(true);
  });
  it("returns nothing when no frame reaches the floor (unrelated query)", () => {
    expect(groupVisual([{ row: row(A, 0), sim: VISUAL_RULES.possibleMin - 0.005 }, { row: row(B, 0), sim: 0.21 }], new Map())).toEqual([]);
  });
});

describe("combining with transcript Recall (pure)", () => {
  const text: RecallSearch = {
    query: "q",
    ambiguous: false,
    semantic: { available: true, reason: null },
    results: [{ recordingId: A, startMs: 11_000, endMs: 13_000, seekMs: 11_000, lines: [{ segmentId: "seg_x", startMs: 11_000, endMs: 13_000, text: "there", matched: [] }], sources: ["semantic"], reasons: ["Similar meaning"], score: 0.5, strength: "good" }],
  };
  it("adds visual evidence to an overlapping spoken moment, and keeps others separate", () => {
    const visual = groupVisual([{ row: row(A, 12_000), sim: VISUAL_RULES.likelyMin + 0.02 }, { row: row(B, 3000), sim: VISUAL_RULES.likelyMin + 0.01 }], new Map());
    const m = mergeRecall(text, visual);
    expect(m.results).toHaveLength(2);
    expect(m.results[0]).toMatchObject({ recordingId: A, sources: ["semantic", "visual"], score: 0.55 });
    expect(m.results[0].lines).toHaveLength(1);
    expect(m.results[1]).toMatchObject({ recordingId: B, sources: ["visual"] });
  });
  it("marks a visual-only, low-confidence answer as ambiguous", () => {
    const visual = capForEvents(groupVisual([{ row: row(B, 3000), sim: VISUAL_RULES.likelyMin + 0.01 }], new Map()));
    const m = mergeRecall({ ...text, results: [] }, visual);
    expect(m.ambiguous).toBe(true);
    expect(m.results[0].visual?.confidence).toBe("low");
  });
});

// Real pipeline: FFmpeg sampling + local CLIP on a silent synthetic video. Needs the model in models/.
describe.skipIf(!visualModelStatus().available)("visual index job (FFmpeg + local CLIP)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metal-visual-"));
  const fx = (n: string) => path.join(tmp, n);
  type M = {
    db: import("../db/client").Db;
    schema: typeof import("../db/schema");
    queue: typeof import("../jobs/queue");
    receiveUpload: typeof import("../media/upload").receiveUpload;
    indexer: typeof import("./indexer");
    search: typeof import("./search");
    handlers: Record<string, (ctx: import("../../worker/handlers").JobContext) => Promise<void>>;
  };
  let m: M;
  let id = "";
  const sha = (f: string) => createHash("sha256").update(fs.readFileSync(f)).digest("hex");

  beforeAll(async () => {
    process.env.METAL_DATA_DIR = fx("data");
    process.env.EMBED_MODEL_DIR = path.resolve("models");
    // 0–7 s test pattern, 7–14 s solid red, 14–20 s a fractal; no audio track at all.
    const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    ff([
      "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=7", "-f", "lavfi", "-i", "color=red:size=640x360:rate=30:duration=7", "-f", "lavfi", "-i", "mandelbrot=size=640x360:rate=30",
      "-filter_complex", "[2:v]trim=duration=6,setpts=PTS-STARTPTS[c];[0:v][1:v][c]concat=n=3:v=1[o]", "-map", "[o]", "-c:v", "libx264", "-pix_fmt", "yuv420p", fx("silent.mp4"),
    ]);
    const { openDb } = await import("../db/client");
    m = {
      db: openDb(":memory:"),
      schema: await import("../db/schema"),
      queue: await import("../jobs/queue"),
      receiveUpload: (await import("../media/upload")).receiveUpload,
      indexer: await import("./indexer"),
      search: await import("./search"),
      handlers: (await import("../../worker/handlers")).handlers,
    };
    ({ id } = await m.receiveUpload(m.db, { body: Readable.toWeb(fs.createReadStream(fx("silent.mp4"))) as ReadableStream<Uint8Array>, filename: "silent.mp4" }));
    await runJobs();
  }, 180_000);
  afterAll(() => {
    delete process.env.EMBED_MODEL_DIR;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function runJobs() {
    for (;;) {
      const job = m.queue.claimNextJob(m.db);
      if (!job) return;
      try {
        await m.handlers[job.kind]({ db: m.db, job, progress: () => {}, signal: new AbortController().signal });
        m.queue.completeJob(m.db, job.id);
      } catch (err) {
        m.queue.failJob(m.db, job.id, String(err), { retry: false });
      }
    }
  }

  it("indexes timestamped frames of a silent recording, once", async () => {
    const original = m.db.select().from(m.schema.recordings).where(eq(m.schema.recordings.id, id)).get()!;
    const { managedPath } = await import("../media/storage");
    const before = sha(managedPath(original.originalPath));
    expect(m.indexer.requestVisualIndex(m.db, id)).toBe("queued");
    expect(m.indexer.requestVisualIndex(m.db, id)).toBe("busy");
    await runJobs();
    const v = m.indexer.visualIndexView(m.db, id);
    expect(v).toMatchObject({ status: "done", intervalMs: 2000, outdated: false });
    const frames = m.db.select().from(m.schema.visualFrames).where(eq(m.schema.visualFrames.recordingId, id)).all();
    expect(frames.length).toBe(v.frameCount);
    // Every 2 s plus the two hard cuts (7 s, 14 s).
    const ts = frames.map((f) => f.tMs).sort((a, b) => a - b);
    expect(ts.slice(0, 4)).toEqual([0, 2000, 4000, 6000]);
    expect(ts.some((t) => Math.abs(t - 7000) <= 40)).toBe(true);
    expect(ts.some((t) => Math.abs(t - 14_000) <= 40)).toBe(true);
    for (const f of frames) expect(fs.existsSync(managedPath(f.path))).toBe(true);
    expect(sha(managedPath(original.originalPath))).toBe(before);
    expect(m.indexer.requestVisualIndex(m.db, id)).toBe("current");
  }, 120_000);

  it("finds the red section at its real time, and cuts a playable clip range", async () => {
    // The floors are calibrated on gameplay; a flat synthetic frame scores just under them (≈0.32).
    // This checks sampling and timing, so it uses a lower floor.
    const saved = { ...m.search.VISUAL_RULES };
    Object.assign(m.search.VISUAL_RULES, { likelyMin: 0.3, possibleMin: 0.3 });
    const r = await m.search.searchVisual(m.db, "a plain solid red screen").finally(() => Object.assign(m.search.VISUAL_RULES, saved));
    expect(r.status.available).toBe(true);
    const top = r.hits[0];
    expect(top.recordingId).toBe(id);
    for (const f of top.visual.frames) {
      expect(f.tMs).toBeGreaterThanOrEqual(7000);
      expect(f.tMs).toBeLessThan(14_000);
    }
    expect(top.startMs).toBeGreaterThanOrEqual(6000);
    expect(top.endMs).toBeLessThanOrEqual(15_000);
  }, 60_000);

  it("re-indexing on request replaces frames instead of duplicating them", async () => {
    const n = m.indexer.visualIndexView(m.db, id).frameCount;
    expect(m.indexer.requestVisualIndex(m.db, id, { force: true })).toBe("queued");
    await runJobs();
    expect(m.db.$client.prepare("select count(*) n from visual_frames where recording_id = ?").get(id)).toEqual({ n });
  }, 120_000);
});
