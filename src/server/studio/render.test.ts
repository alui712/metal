import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captionsSrt, storyArgs } from "./render";

describe("story render arguments (pure)", () => {
  it("normalizes every clip, fills silence for clips without audio, and hard-cuts", () => {
    const args = storyArgs(
      [
        { file: "/m/a.mp4", inMs: 2000, outMs: 5000, hasAudio: true },
        { file: "/m/b.mkv", inMs: 0, outMs: 1500, hasAudio: false },
      ],
      "/x/out.mp4",
      { aspect: "9:16", framing: "fill" },
    );
    expect(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 6)).toEqual(["-ss", "2.000", "-t", "3.000", "-i", "/m/a.mp4"]);
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("[0:v:0]setpts=PTS-STARTPTS,fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(graph).toContain("trim=duration=3.000");
    expect(graph).toContain("anullsrc=r=48000:cl=stereo,atrim=duration=1.500");
    expect(graph).toContain("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]");
    expect(args).not.toContain("shell");
    expect(args.at(-1)).toBe("/x/out.mp4");
  });
  it("writes captions on the story timeline", () => {
    expect(
      captionsSrt([
        { recordingId: "r", inMs: 1000, outMs: 4000, caption: "First" },
        { recordingId: "r", inMs: 0, outMs: 2500, caption: null },
        { recordingId: "r", inMs: 0, outMs: 1000, caption: "Third\nline" },
      ]),
    ).toBe("1\n00:00:00,000 --> 00:00:03,000\nFirst\n\n2\n00:00:05,500 --> 00:00:06,500\nThird line\n");
    expect(captionsSrt([{ recordingId: "r", inMs: 0, outMs: 1000, caption: " " }])).toBeNull();
  });
});

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)("story export (real FFmpeg)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metal-studio-"));
  const fx = (n: string) => path.join(tmp, n);
  const ffmpeg = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  const probe = (file: string) =>
    JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).toString()) as {
      format: { duration: string };
      streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number; avg_frame_rate?: string; duration?: string }>;
    };
  type M = {
    db: import("../db/client").Db;
    schema: typeof import("../db/schema");
    queue: typeof import("../jobs/queue");
    stories: typeof import("./stories");
    render: typeof import("./render");
    handlers: Record<string, (ctx: import("../../worker/handlers").JobContext) => Promise<void>>;
    receiveUpload: typeof import("../media/upload").receiveUpload;
    managedPath: typeof import("../media/storage").managedPath;
  };
  let m: M;
  const ids: Record<string, string> = {};

  async function runJobs(failOnce?: string) {
    let failed = false;
    const { PermanentJobError } = await import("../jobs/errors");
    for (;;) {
      const job = m.queue.claimNextJob(m.db);
      if (!job) return;
      try {
        if (failOnce === job.kind && !failed) {
          failed = true;
          throw new Error("simulated worker crash");
        }
        await m.handlers[job.kind]({ db: m.db, job, progress: () => {}, signal: new AbortController().signal });
        m.queue.completeJob(m.db, job.id);
      } catch (err) {
        m.queue.failJob(m.db, job.id, String(err), { retry: !(err instanceof PermanentJobError) });
      }
    }
  }

  beforeAll(async () => {
    process.env.METAL_DATA_DIR = fx("data");
    // Mixed sources: 720p30 H.264 + 440 Hz; 4:3 25 fps MPEG-4 in MKV, no audio; 1080p60 + 880 Hz mono.
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=10", "-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fx("a.mp4")]);
    ffmpeg(["-f", "lavfi", "-i", "testsrc=size=640x480:rate=25:duration=8", "-c:v", "mpeg4", "-q:v", "5", fx("b.mkv")]);
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=60:duration=6", "-f", "lavfi", "-i", "sine=frequency=880:duration=6:sample_rate=44100", "-ac", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fx("c.mp4")]);
    const { openDb } = await import("../db/client");
    m = {
      db: openDb(":memory:"),
      schema: await import("../db/schema"),
      queue: await import("../jobs/queue"),
      stories: await import("./stories"),
      render: await import("./render"),
      handlers: (await import("../../worker/handlers")).handlers,
      receiveUpload: (await import("../media/upload")).receiveUpload,
      managedPath: (await import("../media/storage")).managedPath,
    };
    for (const n of ["a.mp4", "b.mkv", "c.mp4"]) {
      ids[n] = (await m.receiveUpload(m.db, { body: Readable.toWeb(fs.createReadStream(fx(n))) as ReadableStream<Uint8Array>, filename: n })).id;
    }
    await runJobs();
  }, 180_000);
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const story = (ranges: Array<[string, number, number]>, opts: Partial<import("./stories").SaveInput> = {}) => {
    const r = m.stories.createStory(m.db, { sessionId: null, ranges: ranges.map(([n, inMs, outMs]) => ({ recordingId: ids[n], inMs, outMs, caption: `${n} ${inMs}` })) });
    if ("error" in r) throw new Error(r.error);
    const v = m.stories.storyView(m.db, r.id, new Map())!;
    m.stories.saveStory(m.db, r.id, {
      title: "Test night",
      aspect: "16:9",
      framing: "fill",
      captions: false,
      clips: v.project.clips.map((c) => ({ recordingId: c.recordingId, suggestionId: null, inMs: c.inMs, outMs: c.outMs, caption: c.caption })),
      ...opts,
    });
    return r.id;
  };
  const latest = (sid: string) => m.stories.exportsFor(m.db, sid)[0];

  it("renders mixed sources into one browser-playable MP4 with exact length and aligned audio", async () => {
    const sid = story([
      ["a.mp4", 2000, 5000],
      ["b.mkv", 1000, 3500],
      ["c.mp4", 500, 2500],
    ]);
    const req = m.stories.requestExport(m.db, sid);
    expect(req).toHaveProperty("id");
    expect(m.stories.requestExport(m.db, sid)).toMatchObject({ status: 409, error: "This story is already rendering." });
    await runJobs();
    const e = latest(sid);
    expect(e).toMatchObject({ status: "done", progress: 1, clipCount: 3, fileUrl: `/api/exports/${e.id}` });
    const file = m.render.exportFile(e.id);
    const p = probe(file);
    const v = p.streams.find((s) => s.codec_type === "video")!;
    const a = p.streams.find((s) => s.codec_type === "audio")!;
    expect([v.codec_name, v.width, v.height, v.avg_frame_rate, a.codec_name]).toEqual(["h264", 1920, 1080, "30/1", "aac"]);
    expect(Math.abs(Number(p.format.duration) - 7.5)).toBeLessThan(0.1);
    expect(Math.abs(Number(a.duration) - Number(v.duration))).toBeLessThan(0.06);
    // The silent clip (b) must sit exactly at 3.0–5.5 s on the story timeline.
    const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "silencedetect=n=-50dB:d=0.5", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const start = Number(/silence_start: ([\d.]+)/.exec(err)?.[1]);
    const end = Number(/silence_end: ([\d.]+)/.exec(err)?.[1]);
    expect(Math.abs(start - 3.0)).toBeLessThan(0.06);
    expect(Math.abs(end - 5.5)).toBeLessThan(0.06);
    expect(fs.existsSync(file.replace(".mp4", ".part.mp4"))).toBe(false);
  }, 180_000);

  it("renders vertical with captions as a subtitle track", async () => {
    const sid = story([["c.mp4", 0, 2000], ["a.mp4", 0, 1500]], { aspect: "9:16", captions: true });
    await (m.stories.requestExport(m.db, sid), runJobs());
    const p = probe(m.render.exportFile(latest(sid).id));
    const v = p.streams.find((s) => s.codec_type === "video")!;
    expect([v.width, v.height]).toEqual([1080, 1920]);
    expect(p.streams.some((s) => s.codec_type === "subtitle" && s.codec_name === "mov_text")).toBe(true);
    expect(Math.abs(Number(p.format.duration) - 3.5)).toBeLessThan(0.1);
  }, 180_000);

  it("retries after a worker failure and still produces the file", async () => {
    const sid = story([["a.mp4", 0, 1500]]);
    m.stories.requestExport(m.db, sid);
    await runJobs("story-export");
    expect(latest(sid).status).toBe("done");
    expect(fs.statSync(m.render.exportFile(latest(sid).id)).size).toBeGreaterThan(10_000);
  }, 120_000);

  it("refuses missing sources up front and fails corrupt ones honestly", async () => {
    const sid = story([["b.mkv", 0, 1500]]);
    const rec = m.db.select().from(m.schema.recordings).where(eq(m.schema.recordings.id, ids["b.mkv"])).get()!;
    const original = m.managedPath(rec.originalPath);
    const backup = fs.readFileSync(original);
    fs.rmSync(original);
    const proxy = rec.proxyPath ? m.managedPath(rec.proxyPath) : null;
    const proxyBackup = proxy ? fs.readFileSync(proxy) : null;
    if (proxy) fs.rmSync(proxy);
    expect(m.stories.requestExport(m.db, sid)).toMatchObject({ status: 409, error: "Clip 1: “b” is missing from storage." });
    // Corrupt instead of missing: the render fails (after its retry) with a real error, never a fake success.
    fs.writeFileSync(original, Buffer.alloc(4096, 7));
    expect(m.stories.requestExport(m.db, sid)).toHaveProperty("id");
    await runJobs();
    const e = latest(sid);
    expect(e.status).toBe("failed");
    expect(e.error).toMatch(/^Rendering failed/);
    expect(e.fileUrl).toBeNull();
    expect(fs.existsSync(m.render.exportFile(e.id))).toBe(false);
    fs.writeFileSync(original, backup);
    if (proxy && proxyBackup) fs.writeFileSync(proxy, proxyBackup);
  }, 120_000);

  it("saves edits, rejects out-of-range trims, and reports deleted sources", () => {
    const sid = story([["a.mp4", 0, 3000], ["c.mp4", 0, 2000]]);
    const v = m.stories.storyView(m.db, sid, new Map())!;
    const [first, second] = v.project.clips;
    expect(m.stories.saveStory(m.db, sid, { title: "Reordered", aspect: "9:16", framing: "fit", captions: true, clips: [second, first].map((c) => ({ recordingId: c.recordingId, suggestionId: null, inMs: c.inMs + 200, outMs: c.outMs, caption: c.caption })) })).toHaveProperty("updatedAt");
    const after = m.stories.storyView(m.db, sid, new Map())!;
    expect(after.project).toMatchObject({ title: "Reordered", aspect: "9:16", framing: "fit", captions: true });
    expect(after.project.clips.map((c) => [c.recordingId, c.inMs, c.outMs])).toEqual([
      [ids["c.mp4"], 200, 2000],
      [ids["a.mp4"], 200, 3000],
    ]);
    expect(m.stories.saveStory(m.db, sid, { title: "x", aspect: "16:9", framing: "fill", captions: false, clips: [{ recordingId: ids["c.mp4"], suggestionId: null, inMs: 0, outMs: 999_999, caption: null }] })).toMatchObject({ status: 400 });
    m.db.delete(m.schema.recordings).where(eq(m.schema.recordings.id, ids["c.mp4"])).run();
    const gone = m.stories.storyView(m.db, sid, new Map())!;
    expect(gone.removedCount).toBe(1);
    expect(gone.project.clips.map((c) => c.recordingId)).toEqual([ids["a.mp4"]]);
  });
});
