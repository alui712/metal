import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { needsProxy, parseProbe, type MediaInfo } from "./probe";
import { parseRange } from "./range";
import { sniffContainer } from "./sniff";

describe("parseRange", () => {
  it("handles open, closed, suffix, and clamped ranges", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });
  it("rejects ranges outside the file and ignores malformed ones", () => {
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=20-10", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
  });
});

describe("sniffContainer", () => {
  const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
  it("recognizes ISO-BMFF and EBML", () => {
    expect(sniffContainer(bytes("\0\0\0\x20ftypisom\0\0"))).toBe("isobmff");
    expect(sniffContainer(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("ebml");
  });
  it("rejects other content", () => {
    expect(sniffContainer(bytes("#!/bin/sh\necho hi\n"))).toBeNull();
    expect(sniffContainer(bytes("short"))).toBeNull();
  });
});

describe("parseProbe / needsProxy", () => {
  const probe = {
    streams: [
      { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, pix_fmt: "yuv420p", avg_frame_rate: "60000/1001" },
      { codec_type: "audio", codec_name: "aac" },
    ],
    format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "12.5", tags: { creation_time: "2026-10-16T21:12:03.000000Z" } },
  };
  it("extracts metadata", () => {
    const info = parseProbe(probe);
    expect(info).toMatchObject({ durationMs: 12500, width: 1920, height: 1080, fps: 59.94, videoCodec: "h264", audioCodec: "aac" });
    expect(info.createdAt).toBe(Date.UTC(2026, 9, 16, 21, 12, 3));
  });
  it("rejects files without a video stream or duration", () => {
    expect(() => parseProbe({ streams: [{ codec_type: "audio", codec_name: "aac" }], format: { duration: "3" } })).toThrow(/No video stream/);
    expect(() => parseProbe({ ...probe, format: { duration: "N/A" } })).toThrow(/readable video/);
  });
  it("decides when a browser-safe proxy is needed", () => {
    const info: MediaInfo = parseProbe(probe);
    expect(needsProxy(info, "mp4")).toBe(false);
    expect(needsProxy(info, "mkv")).toBe(true);
    expect(needsProxy({ ...info, videoCodec: "hevc" }, "mp4")).toBe(true);
    expect(needsProxy({ ...info, pixFmt: "yuv420p10le" }, "mp4")).toBe(true);
    expect(needsProxy({ ...info, audioCodec: "pcm_s16le" }, "mov")).toBe(true);
    expect(needsProxy({ ...info, videoCodec: "vp9", audioCodec: "opus" }, "webm")).toBe(false);
  });
});

// ── End-to-end ingest against real FFmpeg ───────────────────
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)("ingest pipeline (real FFmpeg)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metal-ingest-"));
  const fixtures = path.join(tmp, "fixtures");
  let mod: {
    db: import("../db/client").Db;
    receiveUpload: typeof import("./upload").receiveUpload;
    UploadError: typeof import("./upload").UploadError;
    ingest: typeof import("./ingest").ingestRecording;
    claim: typeof import("../jobs/queue").claimNextJob;
    managedPath: typeof import("./storage").managedPath;
    recordings: typeof import("../db/schema").recordings;
  };

  const lavfi = (out: string, extra: string[]) =>
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", ...extra, out]);

  beforeAll(async () => {
    process.env.METAL_DATA_DIR = path.join(tmp, "data");
    fs.mkdirSync(fixtures);
    lavfi(path.join(fixtures, "clip.mp4"), ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest"]);
    lavfi(path.join(fixtures, "clip.mkv"), ["-c:v", "mpeg4", "-c:a", "mp3", "-shortest"]);
    // Valid MP4 signature, garbage after: passes the sniff, fails ffprobe.
    fs.writeFileSync(path.join(fixtures, "corrupt.mp4"), Buffer.concat([Buffer.from("\0\0\0\x20ftypisom\0\0\0\0"), Buffer.alloc(4096, 7)]));
    fs.writeFileSync(path.join(fixtures, "script.mp4"), "#!/bin/sh\necho owned\n");

    const { openDb } = await import("../db/client");
    const upload = await import("./upload");
    mod = {
      db: openDb(":memory:"),
      receiveUpload: upload.receiveUpload,
      UploadError: upload.UploadError,
      ingest: (await import("./ingest")).ingestRecording,
      claim: (await import("../jobs/queue")).claimNextJob,
      managedPath: (await import("./storage")).managedPath,
      recordings: (await import("../db/schema")).recordings,
    };
  }, 60_000);

  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const upload = (name: string, as = name) =>
    mod.receiveUpload(mod.db, {
      body: Readable.toWeb(fs.createReadStream(path.join(fixtures, name))) as ReadableStream<Uint8Array>,
      filename: as,
      lastModified: Date.UTC(2026, 9, 20),
    });

  async function runIngest() {
    const job = mod.claim(mod.db)!;
    expect(job.kind).toBe("ingest");
    return mod.ingest({ db: mod.db, job, progress: () => {}, signal: new AbortController().signal });
  }

  const rec = async (id: string) => {
    const { eq } = await import("drizzle-orm");
    return mod.db.select().from(mod.recordings).where(eq(mod.recordings.id, id)).get()!;
  };

  it("imports an MP4: metadata, poster, plays as-is", async () => {
    const { id, duplicate } = await upload("clip.mp4", "../../etc/My Clutch_Round.mp4");
    expect(duplicate).toBe(false);
    await runIngest();
    const r = await rec(id);
    expect(r).toMatchObject({ status: "ready", width: 320, height: 240, videoCodec: "h264", audioCodec: "aac", title: "My Clutch Round", proxyPath: null });
    expect(r.durationMs).toBeGreaterThan(1900);
    expect(r.originalPath).toBe(`${id}/original.mp4`);
    expect(fs.statSync(mod.managedPath(r.posterPath!)).size).toBeGreaterThan(1000);
  }, 60_000);

  it("dedupes identical content", async () => {
    const again = await upload("clip.mp4", "renamed.mp4");
    expect(again.duplicate).toBe(true);
    expect(fs.readdirSync(path.join(tmp, "data", "media", ".incoming"))).toEqual([]);
  });

  it("builds a browser-safe proxy for MKV", async () => {
    const { id } = await upload("clip.mkv");
    await runIngest();
    const r = await rec(id);
    expect(r.status).toBe("ready");
    expect(r.proxyPath).toBe(`${id}/proxy.mp4`);
    const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", mod.managedPath(r.proxyPath!)]);
    expect(out.toString().trim()).toBe("h264");
  }, 60_000);

  it("fails a corrupt file permanently with a friendly message", async () => {
    const { id } = await upload("corrupt.mp4");
    await expect(runIngest()).rejects.toThrow(/readable video/);
    const r = await rec(id);
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/readable video/);
    expect(r.error).not.toMatch(/\//);
  }, 30_000);

  it("rejects non-video bytes before storing them", async () => {
    await expect(upload("script.mp4")).rejects.toMatchObject({ status: 415 });
    await expect(upload("clip.mp4", "clip.exe")).rejects.toMatchObject({ status: 415 });
    await expect(upload("clip.mp4", "clip.webm")).rejects.toMatchObject({ status: 415 });
  });

  it("refuses paths outside managed storage", () => {
    expect(() => mod.managedPath("../metal.db")).toThrow(/outside/);
    expect(() => mod.managedPath("/etc/passwd")).toThrow(/outside/);
  });
});
