import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alignSegments, dtwPreset, parseVoiced, parseWhisperJson, type RawSegment } from "./transcribe";

const seg = (fromMs: number, toMs: number, text: string, confidence = 0.9): RawSegment => ({ fromMs, toMs, text, confidence });

describe("speech alignment (pure)", () => {
  it("turns silencedetect output into sounding intervals", () => {
    const log = "silence_start: 0\nsilence_end: 3.01 | silence_duration: 3.01\nsilence_start: 5.28\nsilence_end: 11.28 | silence_duration: 6\nsilence_start: 14.9\n";
    expect(parseVoiced(log, 19_000)).toEqual([
      { startMs: 3010, endMs: 5280 },
      { startMs: 11_280, endMs: 14_900 },
    ]);
    expect(parseVoiced("", 5000)).toEqual([{ startMs: 0, endMs: 5000 }]);
    expect(parseVoiced("silence_start: 0\n", 5000)).toEqual([]);
  });

  it("snaps whisper's drifting boundaries to the measured sound", () => {
    // Real whisper output for speech at 3.0–5.3 s and 11.3–14.9 s: the first segment swallows the leading silence.
    const voiced = [
      { startMs: 3010, endMs: 5280 },
      { startMs: 11_280, endMs: 14_900 },
    ];
    const out = alignSegments([seg(0, 11_460, "OK team, push to the left side now."), seg(11_460, 12_860, "Nice shot!"), seg(12_860, 14_900, "We won the round.")], voiced);
    expect(out.map((s) => [s.startMs, s.endMs])).toEqual([
      [3010, 5280],
      [11_460, 12_860],
      [12_860, 14_900],
    ]);
  });

  it("drops words heard in silence, non-speech tags, and unsure guesses", () => {
    const voiced = [{ startMs: 5000, endMs: 8000 }];
    expect(alignSegments([seg(0, 2000, "You")], voiced)).toEqual([]);
    // Stretched across a silence onto a later sound: keeps the larger run.
    expect(alignSegments([seg(5000, 12_000, "We won the round.")], [{ startMs: 5000, endMs: 7200 }, { startMs: 11_000, endMs: 12_000 }])).toMatchObject([{ startMs: 5000, endMs: 7200 }]);
    expect(alignSegments([seg(5000, 7000, "[BLANK_AUDIO]"), seg(5000, 7000, "(music)"), seg(5000, 7000, "...")], voiced)).toEqual([]);
    expect(alignSegments([seg(5000, 7000, "maybe words", 0.12)], voiced)).toEqual([]);
    expect(alignSegments([seg(5000, 7000, "Go go go")], voiced)).toHaveLength(1);
    // Real whisper output over a 1 s wordless tone: too many words for the sound under it.
    expect(alignSegments([seg(30_000, 41_000, "I'm going to go ahead and get a little bit of a shot.", 0.83)], [{ startMs: 40_000, endMs: 41_000 }])).toEqual([]);
  });

  it("parses whisper-cli -ojf JSON, ignoring special tokens in confidence", () => {
    const j = JSON.stringify({
      result: { language: "en" },
      transcription: [{ offsets: { from: 100, to: 900 }, text: " Hello there.", tokens: [{ text: "[_BEG_]", p: 0.1 }, { text: " Hello", p: 0.9 }, { text: " there", p: 0.7 }] }],
    });
    const p = parseWhisperJson(j);
    expect(p.language).toBe("en");
    expect(p.segments[0]).toMatchObject({ fromMs: 100, toMs: 900, text: "Hello there." });
    expect(p.segments[0].confidence).toBeCloseTo(0.8);
  });

  it("uses DTW word times when present (real output: speech at 22 s inside a 14.5–23.9 s window)", () => {
    const j = JSON.stringify({
      transcription: [
        { offsets: { from: 14_500, to: 23_860 }, text: " Nice, I got one.", tokens: [{ text: "[_BEG_]", p: 1, t_dtw: -1 }, { text: " Nice", p: 0.9, t_dtw: 2220 }, { text: " one", p: 0.9, t_dtw: 2330 }, { text: ".", p: 0.9, t_dtw: 2374 }] },
      ],
    });
    expect(parseWhisperJson(j).segments[0]).toMatchObject({ fromMs: 22_200, toMs: 23_860 });
    expect(dtwPreset("ggml-base.en.bin")).toBe("base.en");
    expect(dtwPreset("ggml-large-v3-turbo.bin")).toBe("large.v3.turbo");
    expect(dtwPreset("custom.bin")).toBeNull();
  });
});

// ── End to end with real FFmpeg + whisper.cpp ───────────────

const can = (bin: string, args: string[]) => {
  try {
    execFileSync(bin, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const MODEL = path.resolve("models/ggml-base.en.bin");
const ready = can("ffmpeg", ["-version"]) && can("whisper-cli", ["--help"]) && can("say", ["-o", path.join(os.tmpdir(), "metal-say-probe.aiff"), "hi"]) && fs.existsSync(MODEL);

describe.skipIf(!ready)("local transcription (real whisper.cpp)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metal-speech-"));
  const fx = (n: string) => path.join(tmp, n);
  type M = {
    db: import("../db/client").Db;
    schema: typeof import("../db/schema");
    queue: typeof import("../jobs/queue");
    receiveUpload: typeof import("../media/upload").receiveUpload;
    analyze: typeof import("./analyze");
    tr: typeof import("./transcribe");
    actions: typeof import("../smartclip/actions");
    handlers: Record<string, (ctx: import("../../worker/handlers").JobContext) => Promise<void>>;
  };
  let m: M;
  const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  const video = (s: number) => ["-f", "lavfi", "-i", `testsrc2=size=320x240:rate=30:duration=${s}`];

  beforeAll(async () => {
    process.env.METAL_DATA_DIR = fx("data");
    process.env.WHISPER_MODEL_PATH = MODEL;
    execFileSync("say", ["-o", fx("a.aiff"), "Okay team, push to the left side now."]);
    execFileSync("say", ["-o", fx("b.aiff"), "Nice shot! That was the last one, we won the round."]);
    execFileSync("say", ["-o", fx("c.aiff"), "Two enemies on the stairs."]);
    // Speech at 3 s and 11 s over true silence, plus a loud wordless tone burst at 40 s.
    ffmpeg([
      ...video(60), "-i", fx("a.aiff"), "-i", fx("b.aiff"),
      "-f", "lavfi", "-i", "aevalsrc='0.5*sin(2*PI*440*t)*between(t,40,41)':s=48000:d=60",
      "-filter_complex", "[1:a]aresample=48000,adelay=3000:all=1[a];[2:a]aresample=48000,adelay=11000:all=1[b];[3:a][a][b]amix=inputs=3:normalize=0:duration=first[o]",
      "-map", "0:v", "-map", "[o]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "60", fx("talk.mp4"),
    ]);
    // Speech at 20 s over constant background sound (no silence to align against).
    ffmpeg([
      ...video(40), "-i", fx("c.aiff"), "-f", "lavfi", "-i", "aevalsrc='0.01*sin(2*PI*180*t)':s=48000:d=40",
      "-filter_complex", "[1:a]aresample=48000,adelay=20000:all=1[c];[2:a][c]amix=inputs=2:normalize=0:duration=first[o]",
      "-map", "0:v", "-map", "[o]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "40", fx("noisy.mp4"),
    ]);
    ffmpeg([...video(10), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", fx("silent.mp4")]);
    ffmpeg([...video(6), "-c:v", "libx264", "-pix_fmt", "yuv420p", fx("noaudio.mp4")]);
    const { openDb } = await import("../db/client");
    m = {
      db: openDb(":memory:"),
      schema: await import("../db/schema"),
      queue: await import("../jobs/queue"),
      receiveUpload: (await import("../media/upload")).receiveUpload,
      analyze: await import("./analyze"),
      tr: await import("./transcribe"),
      actions: await import("../smartclip/actions"),
      handlers: (await import("../../worker/handlers")).handlers,
    };
  }, 120_000);
  afterAll(() => {
    delete process.env.WHISPER_MODEL_PATH;
    delete process.env.WHISPER_PATH;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function runJobs() {
    const { PermanentJobError } = await import("../jobs/errors");
    for (;;) {
      const job = m.queue.claimNextJob(m.db);
      if (!job) return;
      try {
        await m.handlers[job.kind]({ db: m.db, job, progress: () => {}, signal: new AbortController().signal });
        m.queue.completeJob(m.db, job.id);
      } catch (err) {
        m.queue.failJob(m.db, job.id, String(err), { retry: !(err instanceof PermanentJobError) });
      }
    }
  }
  async function importReady(name: string) {
    const { id } = await m.receiveUpload(m.db, { body: Readable.toWeb(fs.createReadStream(fx(name))) as ReadableStream<Uint8Array>, filename: name });
    await runJobs();
    return id;
  }
  const transcribe = async (id: string) => {
    expect(m.tr.requestTranscription(m.db, id)).toBe("queued");
    expect(m.tr.requestTranscription(m.db, id)).toBe("busy");
    await runJobs();
    return m.tr.transcriptView(m.db, id);
  };
  let talkId = "";

  it("transcribes real speech with accurate timestamps", async () => {
    talkId = await importReady("talk.mp4");
    const t = await transcribe(talkId);
    expect(t.status).toBe("done");
    expect(t.model).toBe("ggml-base.en.bin");
    const text = t.segments.map((s) => s.text).join(" ").toLowerCase();
    expect(text).toContain("left side");
    expect(text).toContain("won the round");
    const first = t.segments.find((s) => /left side/i.test(s.text))!;
    expect(Math.abs(first.startMs - 3000)).toBeLessThan(500);
    expect(first.endMs).toBeLessThan(6500);
    const second = t.segments.find((s) => /nice shot/i.test(s.text))!;
    expect(Math.abs(second.startMs - 11_000)).toBeLessThan(700);
    // Nothing is claimed during the silences or the wordless tone.
    for (const s of t.segments) expect((s.startMs >= 2500 && s.endMs <= 6500) || (s.startMs >= 10_500 && s.endMs <= 16_500)).toBe(true);
    // Reusable for search: mirrored into chunks + FTS, with provenance.
    const hits = m.db.all<{ n: number }>(sql`select count(*) as n from chunks_fts where chunks_fts match 'round'`);
    expect(hits[0].n).toBeGreaterThan(0);
    const row = m.db.select().from(m.schema.recordingTranscripts).where(eq(m.schema.recordingTranscripts.recordingId, talkId)).get()!;
    const ai = m.db.select().from(m.schema.aiOutputs).where(eq(m.schema.aiOutputs.id, row.aiOutputId!)).get()!;
    expect(ai).toMatchObject({ kind: "transcript", provider: "whisper.cpp (local)" });
  }, 180_000);

  it("keeps timestamps accurate over constant background sound", async () => {
    const id = await importReady("noisy.mp4");
    const t = await transcribe(id);
    expect(t.voicedMs).toBeGreaterThan(39_000); // nothing silent to align against
    const line = t.segments.find((s) => /stairs/i.test(s.text))!;
    expect(Math.abs(line.startMs - 20_000)).toBeLessThan(600);
    expect(line.endMs).toBeLessThan(23_500);
  }, 180_000);

  it("re-running replaces the transcript instead of duplicating it", async () => {
    const before = m.tr.readSegments(m.db, talkId).length;
    await transcribe(talkId);
    expect(m.tr.readSegments(m.db, talkId)).toHaveLength(before);
    const chunks = m.db.select().from(m.schema.chunks).where(eq(m.schema.chunks.recordingId, talkId)).all();
    expect(chunks).toHaveLength(before);
    expect(m.db.select().from(m.schema.aiOutputs).all().filter((a) => a.kind === "transcript" && a.inputRefsJson.includes(talkId))).toHaveLength(1);
  }, 180_000);

  it("adds speech to Smart Clip as evidence without changing scores", async () => {
    expect(m.analyze.requestAnalysis(m.db, talkId)).toBe("queued");
    await runJobs();
    const s = m.actions.listSuggestions(m.db, talkId);
    expect(s.length).toBeGreaterThan(0);
    const withSpeech = s.filter((x) => x.speech.length);
    expect(withSpeech.length).toBeGreaterThan(0);
    // The tone-only moment gets no words attached.
    const tone = s.find((x) => x.startMs <= 40_000 && x.endMs >= 41_000);
    expect(tone?.speech ?? []).toEqual([]);
    for (const x of withSpeech) {
      for (const g of x.speech) expect(g.endMs > x.startMs && g.startMs < x.endMs).toBe(true);
      expect(x.uncertainty).toMatch(/what was said, not what happened/);
      // Titles still describe measurements only.
      expect(x.title).toMatch(/^(Loud moment|Sudden loud sound|Rapid on-screen changes) at/);
    }
    const scores = s.map((x) => x.score);
    await transcribe(talkId);
    expect(m.actions.listSuggestions(m.db, talkId).map((x) => x.score)).toEqual(scores);
    expect(m.actions.analysisView(m.db, talkId).signals?.speech.ok).toBe(true);
  }, 180_000);

  it("finds no speech in a silent recording (and doesn't run the model)", async () => {
    const id = await importReady("silent.mp4");
    const t = await transcribe(id);
    expect(t).toMatchObject({ status: "done", hasAudio: true, segments: [] });
    expect(t.voicedMs).toBeLessThan(300);
  }, 60_000);

  it("reports a recording without audio honestly", async () => {
    const id = await importReady("noaudio.mp4");
    const t = await transcribe(id);
    expect(t).toMatchObject({ status: "done", hasAudio: false, segments: [] });
  }, 60_000);

  it("fails clearly, without retrying, when the model is unavailable", async () => {
    const id = await importReady("noaudio.mp4"); // duplicate → same recording; status is reset by the request
    process.env.WHISPER_MODEL_PATH = fx("missing.bin");
    try {
      expect(m.tr.transcriptView(m.db, id).setup).toMatchObject({ available: false, reason: expect.stringMatching(/no Whisper model/) });
      m.tr.requestTranscription(m.db, id);
      await runJobs();
      const t = m.tr.transcriptView(m.db, id);
      expect(t.status).toBe("failed");
      expect(t.error).toMatch(/no Whisper model/);
      const job = m.db.select().from(m.schema.jobs).where(eq(m.schema.jobs.kind, "transcribe")).all().at(-1)!;
      expect(job.attempts).toBe(1);
    } finally {
      process.env.WHISPER_MODEL_PATH = MODEL;
    }
  }, 60_000);

  it("retries after a failed inference and then succeeds", async () => {
    const flag = fx("failed-once");
    const fake = fx("whisper-flaky.sh");
    fs.writeFileSync(fake, `#!/bin/sh\ncase "$1" in --help) exit 0;; esac\nif [ ! -f "${flag}" ]; then touch "${flag}"; echo "simulated inference crash" >&2; exit 3; fi\nexec whisper-cli "$@"\n`, { mode: 0o755 });
    process.env.WHISPER_PATH = fake;
    try {
      m.tr.requestTranscription(m.db, talkId);
      const job = m.queue.claimNextJob(m.db)!;
      await expect(m.handlers.transcribe({ db: m.db, job, progress: () => {}, signal: new AbortController().signal })).rejects.toThrow(/simulated inference crash/);
      m.queue.failJob(m.db, job.id, "crash", { retry: true });
      expect(m.tr.transcriptView(m.db, talkId).status).toBe("queued");
      await runJobs();
      const t = m.tr.transcriptView(m.db, talkId);
      expect(t.status).toBe("done");
      expect(t.segments.some((s) => /left side/i.test(s.text))).toBe(true);
    } finally {
      delete process.env.WHISPER_PATH;
    }
  }, 180_000);
});
