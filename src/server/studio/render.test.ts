import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { captionSvg, captionsSrt, storyArgs } from "./render";

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
  it("burns captions with timed overlays after the concat, keeping the subtitle track", () => {
    const args = storyArgs([{ file: "/m/a.mp4", inMs: 0, outMs: 3000, hasAudio: true }, { file: "/m/b.mp4", inMs: 0, outMs: 2000, hasAudio: true }], "/x/o.mp4", {
      aspect: "16:9",
      framing: "fill",
      subtitles: "/x/o.srt",
      overlays: [{ file: "/x/c0.png", startMs: 0, endMs: 3000 }, { file: "/x/c1.png", startMs: 3000, endMs: 5000 }],
    });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("concat=n=2:v=1:a=1[vc][a]");
    expect(graph).toContain("[vc][2:v]overlay=x=(W-w)/2:y=H-h-86:enable='between(t,0.000,2.999)':format=auto[vo0]");
    expect(graph).toContain("[vo0][3:v]overlay=x=(W-w)/2:y=H-h-86:enable='between(t,3.000,4.999)':format=auto[v]");
    expect(args.join(" ")).toContain("-map 4:s:0 -c:s mov_text");
  });
  it("lays out caption boxes: wraps, caps at three lines, escapes text", () => {
    const one = captionSvg("Two enemies on the stairs.", "16:9")!;
    expect(one.svg.match(/<tspan/g)).toHaveLength(1);
    expect(one.height).toBe(2 * Math.round(50 * 0.45) + Math.round(50 * 1.25)); // padding + 1 line
    const long = captionSvg("word ".repeat(80), "9:16")!;
    expect(long.svg.match(/<tspan/g)).toHaveLength(3);
    expect(long.svg).toContain("…");
    expect(long.width).toBeLessThanOrEqual(Math.round(1080 * 0.88));
    expect(captionSvg(`<b>"A&B"</b>`, "1:1")!.svg).toContain("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;");
    expect(captionSvg("   ", "16:9")).toBeNull();
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
    // Two POVs of one "world" (Multi-POV): each frame's brightness encodes the world frame w as 16 + (w mod 32)·6 (inside video range).
    // p films from world frame 0 with a 440 Hz tone; s starts 21 frames (700 ms) later with 880 Hz.
    const world = (name: string, start: number, seconds: number, hz: number, tags = "") =>
      ffmpeg(["-f", "lavfi", "-i", `color=c=black:size=320x240:rate=30:duration=${seconds},geq=lum='16+mod(N+${start},32)*6':cb=128:cr=128${tags}`, "-f", "lavfi", "-i", `sine=frequency=${hz}:duration=${seconds}`, "-c:v", "libx264", "-qp", "0", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", fx(name)]);
    world("p.mp4", 0, 5, 440);
    // Like a clip with an appended outro: s's stream changes colour tags (new in-band SPS) 2.5 s in, mid-clip.
    world("s1.ts", 21, 2.5, 880);
    world("s2.ts", 21 + 75, 2.5, 880, ",setparams=range=tv:color_primaries=bt709:color_trc=iec61966-2-1");
    fs.writeFileSync(fx("s.txt"), `file '${fx("s1.ts")}'\nfile '${fx("s2.ts")}'\n`);
    ffmpeg(["-f", "concat", "-safe", "0", "-i", fx("s.txt"), "-c", "copy", fx("s.mp4")]);
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
    for (const n of ["a.mp4", "b.mkv", "c.mp4", "p.mp4", "s.mp4"]) {
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
  const saveOf = (sid: string) => {
    const v = m.stories.storyView(m.db, sid, new Map())!;
    return { title: v.project.title, aspect: v.project.aspect, framing: v.project.framing ?? "fill", captions: v.project.captions, clips: v.project.clips.map((c) => ({ recordingId: c.recordingId, suggestionId: c.momentId, inMs: c.inMs, outMs: c.outMs, caption: c.caption })) } as import("./stories").SaveInput;
  };

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

  it("renders a side-by-side clip with both POVs aligned frame for frame", async () => {
    // As the Multi-POV handoff sends it: s's own time = p's own time − 700 ms, already trimmed in the Studio.
    const r = m.stories.createStory(m.db, { sessionId: null, ranges: [{ recordingId: ids["a.mp4"], inMs: 0, outMs: 1000 }] });
    if ("error" in r) throw new Error(r.error);
    expect(
      m.stories.saveStory(m.db, r.id, {
        title: "Both POVs",
        aspect: "16:9",
        framing: "fill",
        captions: true,
        clips: [
          { recordingId: ids["a.mp4"], suggestionId: null, inMs: 0, outMs: 1000, caption: null },
          { recordingId: ids["p.mp4"], suggestionId: null, inMs: 1500, outMs: 4000, caption: "Both POVs", secondary: { recordingId: ids["s.mp4"], inMs: 800 } },
        ],
      }),
    ).toHaveProperty("updatedAt");
    await (m.stories.requestExport(m.db, r.id), runJobs());
    const e = latest(r.id);
    expect(e).toMatchObject({ status: "done", clipCount: 2 });
    const file = m.render.exportFile(e.id);
    const p = probe(file);
    const v = p.streams.find((s) => s.codec_type === "video")!;
    expect([v.width, v.height, v.avg_frame_rate]).toEqual([1920, 1080, "30/1"]);
    expect(Math.abs(Number(p.format.duration) - 3.5)).toBeLessThan(0.1);
    execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"]); // decodes cleanly end to end

    // Mean luma of a patch in each half, every frame of the split clip (story 1.0–3.5 s).
    const luma = (x: number) => {
      const raw = execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", file, "-t", "2.5", "-vf", `crop=40:40:${x}:520,scale=2:2:flags=area`, "-pix_fmt", "yuv420p", "-f", "rawvideo", "-"]);
      return Array.from({ length: Math.floor(raw.length / 6) }, (_, k) => (raw[k * 6] + raw[k * 6 + 1] + raw[k * 6 + 2] + raw[k * 6 + 3]) / 4);
    };
    const frameOf = (y: number) => Math.round((y - 16) / 6) % 32;
    const left = luma(460).map(frameOf);
    const right = luma(1420).map(frameOf);
    expect(left.length).toBeGreaterThanOrEqual(74);
    const off = (a: number, b: number) => ((b - a + 48) % 32) - 16; // signed frame difference
    // Left is p from own 1.5 s (world frame 45); right shows the same world frame (±1).
    left.forEach((f, k) => expect(Math.abs(off((45 + k) % 32, f))).toBeLessThanOrEqual(1));
    left.forEach((f, k) => expect(Math.abs(off(f, right[k]))).toBeLessThanOrEqual(1));
    if (process.env.METAL_KEEP_FRAME) execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "2", "-i", file, "-frames:v", "1", process.env.METAL_KEEP_FRAME]);

    // Losing the second POV blocks the export instead of silently falling back to one POV.
    m.db.delete(m.schema.recordings).where(eq(m.schema.recordings.id, ids["s.mp4"])).run();
    const view = m.stories.storyView(m.db, r.id, new Map())!;
    expect(view.issues[view.project.clips[1].id]).toBe("Its second POV’s recording was deleted.");
    expect(m.stories.requestExport(m.db, r.id)).toEqual({ error: "Clip 2: Its second POV’s recording was deleted.", status: 409 });
  }, 180_000);

  it("renders vertical with captions as a subtitle track", async () => {
    const sid = story([["c.mp4", 0, 2000], ["a.mp4", 0, 1500]], { aspect: "9:16", captions: true });
    await (m.stories.requestExport(m.db, sid), runJobs());
    const p = probe(m.render.exportFile(latest(sid).id));
    const v = p.streams.find((s) => s.codec_type === "video")!;
    expect([v.width, v.height]).toEqual([1080, 1920]);
    expect(p.streams.some((s) => s.codec_type === "subtitle" && s.codec_name === "mov_text")).toBe(true);
    // Burned in: the caption band differs from the same export without captions.
    const band = (f: string) => execFileSync("ffmpeg", ["-v", "error", "-ss", "1", "-i", f, "-frames:v", "1", "-vf", "crop=1080:100:0:1548,scale=36:10,format=gray", "-f", "rawvideo", "-"]);
    m.stories.saveStory(m.db, sid, { ...saveOf(sid), captions: false });
    const withCaps = m.render.exportFile(latest(sid).id);
    await (m.stories.requestExport(m.db, sid), runJobs());
    if (process.env.METAL_KEEP_FRAME) execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-i", withCaps, "-frames:v", "1", process.env.METAL_KEEP_FRAME]);
    const a = band(withCaps);
    const b = band(m.render.exportFile(latest(sid).id));
    expect(a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0) / a.length).toBeGreaterThan(8);
    expect(Math.abs(Number(p.format.duration) - 3.5)).toBeLessThan(0.1);
  }, 180_000);

  it("retries after a worker failure and still produces the file", async () => {
    const sid = story([["a.mp4", 0, 1500]]);
    m.stories.requestExport(m.db, sid);
    await runJobs("story-export");
    expect(latest(sid).status).toBe("done");
    expect(fs.statSync(m.render.exportFile(latest(sid).id)).size).toBeGreaterThan(10_000);
  }, 120_000);

  it("deletes only an owned export file and tolerates an already-missing file", async () => {
    const sid = story([["a.mp4", 0, 1500]]);
    const other = story([["a.mp4", 2000, 3500]]);
    m.stories.requestExport(m.db, sid);
    await runJobs();
    const first = latest(sid);
    const firstFile = m.render.exportFile(first.id);
    expect(fs.existsSync(firstFile)).toBe(true);
    expect(m.stories.deleteExport(m.db, first.id, other)).toMatchObject({ status: 404 });
    expect(fs.existsSync(firstFile)).toBe(true);
    expect(m.stories.deleteExport(m.db, first.id, sid)).toEqual({ ok: true });
    expect(fs.existsSync(firstFile)).toBe(false);
    expect(m.stories.exportsFor(m.db, sid)).toEqual([]);

    m.stories.requestExport(m.db, other);
    await runJobs();
    const second = latest(other);
    fs.rmSync(m.render.exportFile(second.id));
    expect(m.stories.deleteExport(m.db, second.id, other)).toEqual({ ok: true });
    expect(m.stories.exportsFor(m.db, other)).toEqual([]);
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
