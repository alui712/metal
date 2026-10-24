import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCandidates, clipBounds, RULES, type Signal } from "../smartclip/candidates";
import { detectAudioEvents, parseEbur128, type LoudnessSample } from "./audio";
import { keyframeTimes, MAX_KEYFRAMES, parseScdet } from "./visual";

// ── Pure rules ──────────────────────────────────────────────

const series = (seconds: number, at: (t: number) => number): LoudnessSample[] =>
  Array.from({ length: seconds * 10 }, (_, i) => ({ tMs: (i + 1) * 100, lufs: at((i + 1) / 10) }));

describe("audio events", () => {
  it("parses ebur128 output and shifts to source time", () => {
    const log = "[Parsed_ebur128_0 @ 0x1] t: 5.499979   TARGET:-23 LUFS    M:  -8.1 S: -15.8     I:  -9.6 LUFS\n[Parsed_ebur128_0 @ 0x1] t: 0.1  TARGET:-23 LUFS    M:-120.7 S:-120.7";
    expect(parseEbur128(log, 40)).toEqual([
      { tMs: 5540, lufs: -8.1 },
      { tMs: 140, lufs: -70 },
    ]);
  });

  it("finds peaks above the recent baseline at the right times", () => {
    const ev = detectAudioEvents(series(30, (t) => (t >= 8 && t < 9.5 ? -12 : t >= 20 && t < 20.8 ? -18 : -38)), 30_000);
    const peaks = ev.filter((e) => e.kind === "loudness_peak");
    expect(peaks).toHaveLength(2);
    expect(Math.abs(Number(peaks[0].evidence.peakMs) - 8000)).toBeLessThan(500);
    expect(Math.abs(Number(peaks[1].evidence.peakMs) - 20000)).toBeLessThan(500);
    expect(peaks[0].evidence).toMatchObject({ baselineLufs: -38, overBaselineLu: 26, suddenOnset: true });
    expect(peaks[0].score).toBeGreaterThan(peaks[1].score);
  });

  it("reports nothing for steady or silent audio, and marks long silence", () => {
    expect(detectAudioEvents(series(30, () => -24), 30_000)).toEqual([]);
    const silent = detectAudioEvents(series(10, () => -90), 10_000);
    expect(silent.map((e) => e.kind)).toEqual(["silence"]);
  });
});

describe("visual signals", () => {
  it("parses scdet and picks capped keyframes including scene changes", () => {
    expect(parseScdet("[Parsed_scdet_1 @ 0x1] lavfi.scd.score: 21.295, lavfi.scd.time: 4.5")).toEqual([{ tMs: 4500, score: 21.295 }]);
    const picks = keyframeTimes(60_000, [{ tMs: 12_345, score: 40 }]);
    expect(picks.some((p) => p.scene && p.tMs === 12_445)).toBe(true);
    expect(keyframeTimes(3 * 3600_000, Array.from({ length: 50 }, (_, i) => ({ tMs: i * 60_000 + 5000, score: 20 + i })))).toHaveLength(MAX_KEYFRAMES);
    expect(keyframeTimes(0, [])).toEqual([]);
  });
});

const peak = (atMs: number, over = 15, extra: Partial<{ suddenOnset: boolean }> = {}): Signal => ({
  kind: "loudness_peak",
  startMs: atMs - 500,
  endMs: atMs + 700,
  score: Math.min(1, (over - 9) / 15),
  evidence: { peakMs: atMs, overBaselineLu: over, peakLufs: -15, ...extra },
});

describe("Smart Clip candidates", () => {
  it("one suggestion per separate event, ranked with an explained score", () => {
    const c = buildCandidates([peak(30_000, 24, { suddenOnset: true }), peak(120_000, 14)], 300_000);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ startMs: 30_000 - 500 - RULES.preRollMs, title: "Loud moment at 0:30" });
    expect(c[0].score).toBeGreaterThan(c[1].score);
    expect(c[0].breakdown.map((b) => b.rule)).toContain("Sudden onset");
    expect(c[0].evidence[0].detail).toMatch(/24 LU louder than the previous 15 s/);
  });

  it("groups nearby signals and merges overlapping clips", () => {
    const grouped = buildCandidates([peak(30_000), peak(32_500)], 300_000);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].breakdown.map((b) => b.rule)).toContain("2 signals close together");
    const merged = buildCandidates([peak(30_000), peak(40_000)], 300_000); // separate events, overlapping clips
    expect(merged).toHaveLength(1);
    expect(merged[0].endMs - merged[0].startMs).toBeLessThanOrEqual(RULES.maxClipMs);
    // No two suggestions ever share footage.
    const many = buildCandidates(Array.from({ length: 30 }, (_, i) => peak(10_000 + i * 7000, 10 + (i % 7))), 400_000);
    for (let i = 1; i < many.length; i++) expect(many[i].startMs).toBeGreaterThanOrEqual(many[i - 1].endMs);
    expect(many.length).toBeLessThanOrEqual(RULES.maxSuggestions);
  });

  it("keeps boundaries inside the video with enough footage near the start and end", () => {
    // Pre-roll cut off by 0:00: the clip keeps its length by extending the end.
    expect(clipBounds(1000, 1500, 60_000)).toEqual({ startMs: 0, endMs: 10_500 });
    expect(clipBounds(58_500, 59_500, 60_000)).toEqual({ startMs: 49_000, endMs: 60_000 }); // shifted back, same length
    expect(clipBounds(1000, 2000, 6000)).toEqual({ startMs: 0, endMs: 6000 });
    // A suggestion spanning most of a short recording adds nothing: skipped.
    expect(buildCandidates([peak(3000)], 8000)).toEqual([]);
    const [c] = buildCandidates([peak(800)], 30_000);
    expect(c.startMs).toBe(0);
    expect(c.endMs - c.startMs).toBeGreaterThanOrEqual(RULES.minClipMs);
  });

  it("suggests nothing without signals, and labels picture-only bursts as weak", () => {
    expect(buildCandidates([], 60_000)).toEqual([]);
    expect(buildCandidates([{ kind: "scene_change", startMs: 5000, endMs: 5000, score: 0.3, evidence: {} }], 60_000)).toEqual([]);
    const burst = buildCandidates([5000, 6000, 7000].map((t) => ({ kind: "scene_change" as const, startMs: t, endMs: t, score: 0.3, evidence: {} })), 60_000);
    expect(burst).toHaveLength(1);
    expect(burst[0]).toMatchObject({ confidence: "weak", title: "Rapid on-screen changes at 0:05" });
  });
});

// ── End to end with real FFmpeg ─────────────────────────────

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)("analysis + Smart Clip (real FFmpeg)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metal-analysis-"));
  const fx = (n: string) => path.join(tmp, n);
  type M = {
    db: import("../db/client").Db;
    schema: typeof import("../db/schema");
    queue: typeof import("../jobs/queue");
    receiveUpload: typeof import("../media/upload").receiveUpload;
    analyze: typeof import("./analyze");
    actions: typeof import("../smartclip/actions");
    handlers: Record<string, (ctx: import("../../worker/handlers").JobContext) => Promise<void>>;
    managedPath: typeof import("../media/storage").managedPath;
  };
  let m: M;
  const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  const video = (seconds: number) => ["-f", "lavfi", "-i", `testsrc2=size=320x240:rate=30:duration=${seconds}`];

  beforeAll(async () => {
    process.env.METAL_DATA_DIR = fx("data");
    // Quiet tone with loud bursts at 5–6.5 s and 30–30.8 s.
    ffmpeg([...video(40), "-f", "lavfi", "-i", "aevalsrc='0.02*sin(2*PI*220*t)*(1+30*between(t,5,6.5)+20*between(t,30,30.8))':s=48000:d=40", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fx("bursts.mp4")]);
    ffmpeg([...video(8), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "8", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", fx("silent.mp4")]);
    ffmpeg([...video(8), "-c:v", "libx264", "-pix_fmt", "yuv420p", fx("noaudio.mp4")]);
    ffmpeg([...video(12), "-f", "lavfi", "-i", "sine=frequency=300:duration=12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fx("steady.mp4")]);
    ffmpeg([...video(40), "-f", "lavfi", "-i", "aevalsrc='0.02*sin(2*PI*220*t)*(1+30*between(t,0.3,1.2)+30*between(t,38.5,39.6))':s=48000:d=40", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fx("edges.mp4")]);
    const { openDb } = await import("../db/client");
    const h = await import("../../worker/handlers");
    m = {
      db: openDb(":memory:"),
      schema: await import("../db/schema"),
      queue: await import("../jobs/queue"),
      receiveUpload: (await import("../media/upload")).receiveUpload,
      analyze: await import("./analyze"),
      actions: await import("../smartclip/actions"),
      handlers: h.handlers,
      managedPath: (await import("../media/storage")).managedPath,
    };
  }, 120_000);
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  async function runJobs(failOnce?: string) {
    let failed = false;
    for (;;) {
      const job = m.queue.claimNextJob(m.db);
      if (!job) return;
      try {
        if (failOnce === job.kind && !failed) {
          failed = true;
          throw new Error("simulated outage");
        }
        await m.handlers[job.kind]({ db: m.db, job, progress: () => {}, signal: new AbortController().signal });
        m.queue.completeJob(m.db, job.id);
      } catch (err) {
        m.queue.failJob(m.db, job.id, String(err), { retry: !(err instanceof (await import("../jobs/errors")).PermanentJobError) });
      }
    }
  }
  async function importReady(name: string) {
    const { id } = await m.receiveUpload(m.db, { body: Readable.toWeb(fs.createReadStream(fx(name))) as ReadableStream<Uint8Array>, filename: name });
    await runJobs();
    return id;
  }
  const analyzeNow = async (id: string) => {
    expect(m.analyze.requestAnalysis(m.db, id)).toBe("queued");
    await runJobs();
    return m.actions.analysisView(m.db, id);
  };

  it("finds real loudness events at the right timestamps and suggests clips around them", async () => {
    const id = await importReady("bursts.mp4");
    const a = await analyzeNow(id);
    expect(a.status).toBe("done");
    expect(a.signals?.audio.ok).toBe(true);
    expect(a.signals?.speech).toEqual({ ok: false, note: expect.stringMatching(/isn’t set up|Not transcribed yet/) });
    const peaks = m.db.select().from(m.schema.audioEvents).where(eq(m.schema.audioEvents.recordingId, id)).all().filter((e) => e.kind === "loudness_peak");
    expect(peaks).toHaveLength(2);
    const peakMs = peaks.map((p) => JSON.parse(p.evidenceJson).peakMs as number);
    expect(Math.abs(peakMs[0] - 5500)).toBeLessThan(900);
    expect(Math.abs(peakMs[1] - 30_300)).toBeLessThan(900);
    // Keyframes: real files at their timestamps.
    const frames = m.db.select().from(m.schema.frames).where(eq(m.schema.frames.recordingId, id)).all();
    expect(frames.length).toBeGreaterThan(2);
    for (const f of frames) expect(fs.statSync(m.managedPath(f.path)).size).toBeGreaterThan(500);
    expect(frames.every((f) => f.tMs >= 0 && f.tMs < 40_000)).toBe(true);
    const s = m.actions.listSuggestions(m.db, id);
    expect(s.length).toBeGreaterThanOrEqual(1);
    for (const x of s) {
      expect(x.startMs).toBeGreaterThanOrEqual(0);
      expect(x.endMs).toBeLessThanOrEqual(40_000);
      expect(x.uncertainty).toMatch(/can’t tell what the sound was|can’t hear words/);
      expect(x.title).toMatch(/^(Loud moment|Sudden loud sound) at/);
    }
    // Every detected peak lies inside some suggestion.
    for (const p of peakMs) expect(s.some((x) => p >= x.startMs && p <= x.endMs)).toBe(true);
  });

  it("quiet, silent, and audio-less recordings get no suggestions, with honest status", async () => {
    for (const name of ["steady.mp4", "silent.mp4", "noaudio.mp4"]) {
      const id = await importReady(name);
      const a = await analyzeNow(id);
      expect(a.status, name).toBe("done");
      expect(m.actions.listSuggestions(m.db, id).map((x) => x.evidence), name).toEqual([]);
      if (name === "noaudio.mp4") expect(a.signals?.audio).toEqual({ ok: false, note: "This recording has no audio track." });
      if (name === "silent.mp4") expect(a.counts.silences).toBe(1);
    }
  });

  it("clips near the start and end stay inside the video", async () => {
    const id = await importReady("edges.mp4");
    await analyzeNow(id);
    const s = m.actions.listSuggestions(m.db, id);
    expect(s.length).toBeGreaterThanOrEqual(1);
    expect(s).toHaveLength(2);
    expect(s[0].startMs).toBe(0);
    expect(s[1].endMs).toBe(40_000);
    for (const x of s) expect(x.endMs - x.startMs).toBeGreaterThanOrEqual(RULES.minClipMs);
  });

  it("avoids duplicate analysis, is idempotent, and retries after an outage", async () => {
    const id = await importReady("bursts.mp4").catch(() => "");
    const rec = m.db.select().from(m.schema.recordings).all().find((r) => r.originalFilename === "bursts.mp4")!;
    expect(id === "" || id === rec.id).toBe(true);
    expect(m.analyze.requestAnalysis(m.db, rec.id)).toBe("queued");
    expect(m.analyze.requestAnalysis(m.db, rec.id)).toBe("busy");
    expect(m.db.select().from(m.schema.jobs).all().filter((j) => j.kind === "analyze" && j.status === "queued")).toHaveLength(1);
    const before = m.db.select().from(m.schema.audioEvents).where(eq(m.schema.audioEvents.recordingId, rec.id)).all().length;
    await runJobs("analyze"); // first attempt fails, the retry succeeds
    expect(m.actions.analysisView(m.db, rec.id).status).toBe("done");
    expect(m.db.select().from(m.schema.audioEvents).where(eq(m.schema.audioEvents.recordingId, rec.id)).all().length).toBe(before);
  });

  it("accept saves a real clip; dismiss and adjust persist across re-analysis", async () => {
    const rec = m.db.select().from(m.schema.recordings).all().find((r) => r.originalFilename === "bursts.mp4")!;
    const [first, second] = m.actions.listSuggestions(m.db, rec.id);
    expect(m.actions.applyClipAction(m.db, first.id, { action: "adjust", startMs: first.startMs + 1000, endMs: first.endMs })).toBeNull();
    expect(m.actions.applyClipAction(m.db, first.id, { action: "adjust", startMs: 5000, endMs: 5500 })).toMatch(/at least 1 second/);
    expect(m.actions.applyClipAction(m.db, first.id, { action: "adjust", startMs: 0, endMs: 999_999 })).toMatch(/inside the video/);
    expect(m.actions.applyClipAction(m.db, first.id, { action: "accept" })).toBeNull();
    expect(m.actions.applyClipAction(m.db, first.id, { action: "accept" })).toBeNull(); // idempotent
    expect(m.db.select().from(m.schema.jobs).all().filter((j) => j.kind === "clip-export")).toHaveLength(1);
    await runJobs();
    const saved = m.actions.listSuggestions(m.db, rec.id).find((s) => s.id === first.id)!;
    expect(saved).toMatchObject({ status: "accepted", saveStatus: "saved", savedReady: true });
    const clip = m.db.select().from(m.schema.recordings).where(eq(m.schema.recordings.id, saved.savedRecordingId!)).get()!;
    expect(clip).toMatchObject({ origin: "clip", parentRecordingId: rec.id, parentStartMs: first.startMs + 1000, status: "ready" });
    expect(Math.abs(clip.durationMs! - (first.endMs - first.startMs - 1000))).toBeLessThan(200);
    expect(m.actions.applyClipAction(m.db, first.id, { action: "dismiss" })).toMatch(/already saved/);
    if (second) expect(m.actions.applyClipAction(m.db, second.id, { action: "dismiss" })).toBeNull();
    // Re-analysis keeps decisions and doesn't re-suggest them.
    await analyzeNow(rec.id);
    const after = m.actions.listSuggestions(m.db, rec.id);
    expect(after.find((s) => s.id === first.id)?.saveStatus).toBe("saved");
    if (second) expect(after.find((s) => s.id === second.id)?.status).toBe("dismissed");
    expect(after.filter((s) => s.status === "suggested")).toHaveLength(0);
  });
});
