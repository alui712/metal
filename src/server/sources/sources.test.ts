import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/client";

// Folder sync end-to-end against real files and real FFmpeg, in a temp dir.

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)("watched folder sync", () => {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "metal-sync-")));
  const watch = path.join(tmp, "watch");
  const outside = path.join(tmp, "outside");
  const fixtures = path.join(tmp, "fixtures");
  let db: Db;
  let m: {
    schema: typeof import("../db/schema");
    folders: typeof import("./folders");
    sync: typeof import("./sync");
    importFolderFile: typeof import("./import").importFolderFile;
    ingest: typeof import("../media/ingest").ingestRecording;
    queue: typeof import("../jobs/queue");
    receiveUpload: typeof import("../media/upload").receiveUpload;
  };
  let folderId: string;
  let svc: InstanceType<typeof import("./sync").FolderSync>;
  let clock = Date.now();

  const lavfi = (out: string, seconds: number, freq = 440) =>
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=320x240:rate=30:duration=${seconds}`, "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${seconds}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out]);

  beforeAll(async () => {
    process.env.METAL_DATA_DIR = path.join(tmp, "data");
    for (const d of [watch, outside, fixtures]) fs.mkdirSync(d);
    lavfi(path.join(fixtures, "a.mp4"), 2);
    lavfi(path.join(fixtures, "b.mp4"), 2, 660);
    lavfi(path.join(fixtures, "c.mp4"), 2, 880);
    lavfi(path.join(fixtures, "d.mp4"), 2, 990);
    lavfi(path.join(fixtures, "e.mp4"), 2, 1100);
    const { openDb } = await import("../db/client");
    db = openDb(":memory:");
    m = {
      schema: await import("../db/schema"),
      folders: await import("./folders"),
      sync: await import("./sync"),
      importFolderFile: (await import("./import")).importFolderFile,
      ingest: (await import("../media/ingest")).ingestRecording,
      queue: await import("../jobs/queue"),
      receiveUpload: (await import("../media/upload")).receiveUpload,
    };
    svc = new m.sync.FolderSync(db, { watch: false });
  }, 60_000);
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const folder = () => db.select().from(m.schema.watchedFolders).where(eq(m.schema.watchedFolders.id, folderId)).get()!;
  const files = () => db.select().from(m.schema.folderFiles).where(eq(m.schema.folderFiles.folderId, folderId)).all();
  const file = (rel: string) => files().find((f) => f.relPath === rel);
  const recs = () => db.select().from(m.schema.recordings).all();
  /** Scan "later": far enough apart that unchanged files count as complete. */
  const scan = async (gap = 5000) => {
    clock = Math.max(clock + gap, Date.now() + gap);
    await svc.scan(folder(), clock);
  };
  async function runJobs() {
    for (;;) {
      const job = m.queue.claimNextJob(db);
      if (!job) return;
      const ctx = { db, job, progress: () => {}, signal: new AbortController().signal };
      try {
        await (job.kind === "folder-import" ? m.importFolderFile(ctx) : m.ingest(ctx));
        m.queue.completeJob(db, job.id);
      } catch (err) {
        m.queue.failJob(db, job.id, String(err), { retry: false });
      }
    }
  }
  const backdate = (p: string) => fs.utimesSync(p, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
  const put = (name: string, rel: string) => {
    const dest = path.join(watch, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(fixtures, name), dest);
    backdate(dest);
  };

  it("only accepts specific, real, non-overlapping folders", () => {
    const bad = (p: unknown) => {
      const r = m.folders.checkFolder(db, p);
      expect(r.ok, String(p)).toBe(false);
    };
    bad("/");
    bad(os.homedir());
    bad("~");
    bad("/System/Library");
    bad(path.join(os.homedir(), "Library", "Caches"));
    bad("relative/path");
    bad(path.join(tmp, "nope"));
    bad(path.join(fixtures, "a.mp4"));
    bad(tmp); // contains METAL's data dir
    fs.mkdirSync(path.join(tmp, ".hidden"));
    bad(path.join(tmp, ".hidden"));
    const ok = m.folders.checkFolder(db, watch);
    expect(ok).toEqual({ ok: true, real: watch });
    folderId = m.folders.addFolder(db, { real: watch, kind: "generic" });
    bad(watch);
    bad(path.join(watch)); // same folder
  });

  it("initial scan imports existing videos once they're complete, with real metadata", async () => {
    put("a.mp4", "Session/a.mp4");
    // Unsafe entries are never followed or imported.
    fs.copyFileSync(path.join(fixtures, "b.mp4"), path.join(outside, "secret.mp4"));
    fs.symlinkSync(path.join(outside, "secret.mp4"), path.join(watch, "link.mp4"));
    fs.symlinkSync(outside, path.join(watch, "linked-dir"));
    fs.writeFileSync(path.join(watch, ".hidden.mp4"), "x");
    fs.writeFileSync(path.join(watch, "notes.txt"), "x");

    await svc.scan(folder(), (clock = Date.now()));
    expect(files().map((f) => f.relPath)).toEqual([path.join("Session", "a.mp4")]);
    expect(file("Session/a.mp4")?.status).toBe("pending"); // seen once: not yet confirmed complete
    await scan();
    expect(file("Session/a.mp4")?.status).toBe("importing");
    await runJobs();
    const row = file("Session/a.mp4")!;
    expect(row.status).toBe("imported");
    const rec = recs().find((r) => r.id === row.recordingId)!;
    expect(rec).toMatchObject({ status: "ready", origin: "folder", sourcePath: path.join(watch, "Session", "a.mp4") });
    expect(rec.durationMs).toBeGreaterThan(1500);
    expect(rec.posterPath).toBeTruthy();
    // Source untouched.
    expect(fs.readFileSync(path.join(watch, "Session", "a.mp4")).equals(fs.readFileSync(path.join(fixtures, "a.mp4")))).toBe(true);
    // Nothing is re-queued on later scans.
    await scan();
    expect(m.queue.claimNextJob(db)).toBeUndefined();
  });

  it("waits while a new file is still being written", async () => {
    const dest = path.join(watch, "growing.mp4");
    const bytes = fs.readFileSync(path.join(fixtures, "b.mp4"));
    fs.writeFileSync(dest, bytes.subarray(0, 1000));
    await scan(1000);
    fs.appendFileSync(dest, bytes.subarray(1000, 5000));
    await scan(1000);
    fs.appendFileSync(dest, bytes.subarray(5000));
    await scan(1000);
    expect(file("growing.mp4")?.status).toBe("pending");
    backdate(dest);
    await scan(); // the mtime change itself counts as a change
    expect(file("growing.mp4")?.status).toBe("pending");
    await scan(); // unchanged for long enough now
    expect(file("growing.mp4")?.status).toBe("importing");
    await runJobs();
    expect(file("growing.mp4")?.status).toBe("imported");
  });

  it("links duplicates instead of importing them twice (folder copy and manual upload)", async () => {
    const before = recs().length;
    put("a.mp4", "copy-of-a.mp4");
    await scan();
    await scan();
    await runJobs();
    expect(file("copy-of-a.mp4")).toMatchObject({ status: "duplicate", recordingId: file("Session/a.mp4")!.recordingId });
    // Uploaded by hand first, then found in the folder.
    const up = await m.receiveUpload(db, { body: Readable.toWeb(fs.createReadStream(path.join(fixtures, "c.mp4"))) as ReadableStream<Uint8Array>, filename: "c.mp4" });
    await runJobs();
    put("c.mp4", "c-from-folder.mp4");
    await scan();
    await scan();
    await runJobs();
    expect(file("c-from-folder.mp4")).toMatchObject({ status: "duplicate", recordingId: up.id });
    expect(recs().map((r) => r.originalFilename), JSON.stringify(recs().map((r) => [r.originalFilename, r.status]))).toHaveLength(before + 1);
  });

  it("follows renames and marks removed files without touching the library", async () => {
    const id = file("growing.mp4")!.id;
    fs.renameSync(path.join(watch, "growing.mp4"), path.join(watch, "renamed.mp4"));
    await scan();
    expect(file("renamed.mp4")).toMatchObject({ id, status: "imported" });
    expect(m.queue.claimNextJob(db)).toBeUndefined();
    const recId = file("renamed.mp4")!.recordingId;
    fs.rmSync(path.join(watch, "renamed.mp4"));
    await scan();
    expect(file("renamed.mp4")?.present).toBe(false);
    expect(recs().some((r) => r.id === recId)).toBe(true);
    expect(m.folders.listFolderViews(db)[0].counts.missing).toBe(1);
  });

  it("re-checks a fresh file that isn't readable yet instead of rejecting it", async () => {
    const dest = path.join(watch, "buffered.mp4");
    fs.writeFileSync(dest, Buffer.from("\0\0\0\x20ftypisom\0\0\0\0")); // header only, recorder still buffering
    fs.utimesSync(dest, new Date(Date.now() - 10_000), new Date(Date.now() - 10_000));
    await scan();
    await scan();
    await runJobs();
    expect(file("buffered.mp4")?.status).toBe("pending");
    fs.copyFileSync(path.join(fixtures, "d.mp4"), dest); // the recorder finishes
    backdate(dest);
    await scan();
    await scan();
    await runJobs();
    expect(file("buffered.mp4")?.status).toBe("imported");
  });

  it("rejects invalid videos without creating recordings", async () => {
    const before = recs().length;
    fs.writeFileSync(path.join(watch, "corrupt.mp4"), Buffer.concat([Buffer.from("\0\0\0\x20ftypisom\0\0\0\0"), Buffer.alloc(4096, 7)]));
    fs.writeFileSync(path.join(watch, "script.mkv"), "#!/bin/sh\necho owned\n");
    backdate(path.join(watch, "corrupt.mp4"));
    backdate(path.join(watch, "script.mkv"));
    await scan();
    await scan();
    await runJobs();
    expect(file("corrupt.mp4")?.status).toBe("invalid");
    expect(file("script.mkv")?.status).toBe("invalid");
    expect(file("corrupt.mp4")?.error).toMatch(/readable video/);
    expect(recs().length).toBe(before);
    const view = m.folders.listFolderViews(db)[0];
    expect(view.counts.invalid).toBe(2);
    expect(view.problems.map((p) => p.name).sort()).toEqual(["corrupt.mp4", "script.mkv"]);
    expect(JSON.stringify(view)).not.toContain(path.join(watch, "corrupt.mp4")); // names only
  });

  it("refuses a tampered path that escapes the folder", async () => {
    const row = file("corrupt.mp4")!;
    db.update(m.schema.folderFiles).set({ relPath: "../outside/secret.mp4", status: "importing" }).where(eq(m.schema.folderFiles.id, row.id)).run();
    const job = m.queue.enqueueJob(db, { kind: "folder-import", payload: { fileId: row.id } });
    await runJobs();
    expect(db.select().from(m.schema.folderFiles).where(eq(m.schema.folderFiles.id, row.id)).get()?.status).toBe("failed");
    expect(db.select().from(m.schema.jobs).where(eq(m.schema.jobs.id, job.id)).get()?.status).toBe("failed");
    db.update(m.schema.folderFiles).set({ relPath: "corrupt.mp4", status: "invalid" }).where(eq(m.schema.folderFiles.id, row.id)).run();
  });

  it("recovers after a worker restart: offline additions and interrupted imports", async () => {
    put("e.mp4", "while-offline.mp4");
    svc = new m.sync.FolderSync(db, { watch: false }); // fresh process state
    await scan();
    expect(file("while-offline.mp4")?.status).toBe("pending");
    await scan();
    const row = file("while-offline.mp4")!;
    expect(row.status).toBe("importing");
    // Simulate the job vanishing mid-import (killed worker, cleared queue).
    db.delete(m.schema.jobs).where(eq(m.schema.jobs.id, row.jobId!)).run();
    await scan();
    expect(file("while-offline.mp4")?.status).toBe("importing"); // re-queued
    await runJobs();
    expect(file("while-offline.mp4")?.status).toBe("imported");
  });

  it("reports an unavailable folder and resumes when it's back", async () => {
    const away = `${watch}-moved`;
    fs.renameSync(watch, away);
    await scan();
    expect(folder()).toMatchObject({ state: "unavailable" });
    expect(folder().error).toMatch(/not found/);
    expect(files().filter((f) => f.present).length).toBeGreaterThan(0); // records kept
    fs.renameSync(away, watch);
    await scan();
    expect(folder().state).toBe("watching");
  });

  it("does nothing while paused", async () => {
    m.folders.updateFolder(db, folderId, "pause");
    put("c.mp4", "while-paused.mp4");
    await svc.tick();
    expect(file("while-paused.mp4")).toBeUndefined();
    expect(folder().state).toBe("paused");
    m.folders.updateFolder(db, folderId, "resume");
    await scan();
    expect(file("while-paused.mp4")).toBeDefined();
  });

  it("defers to an in-flight OBS auto-import of the same file, then links it", async () => {
    put("b.mp4", "Replay obs.mp4");
    fs.appendFileSync(path.join(watch, "Replay obs.mp4"), Buffer.alloc(16)); // distinct content
    backdate(path.join(watch, "Replay obs.mp4"));
    const abs = path.join(watch, "Replay obs.mp4");
    const obsJob = m.queue.enqueueJob(db, { kind: "obs-import", payload: { path: abs, kind: "replay", allowedDir: watch } });
    await scan();
    await scan();
    expect(file("Replay obs.mp4")?.status).toBe("pending"); // waits for OBS's import
    // OBS's import lands (simulated) and records its source.
    const { importLocalFile } = await import("../media/local-file");
    const res = await importLocalFile(db, { real: abs, stat: fs.statSync(abs), origin: "obs-replay" });
    m.queue.completeJob(db, obsJob.id);
    await scan();
    expect(file("Replay obs.mp4")).toMatchObject({ status: "imported", recordingId: res.id });
    await runJobs();
    expect(recs().filter((r) => r.sourcePath === abs)).toHaveLength(1);
  });

  it("removing a folder keeps the recordings and the files", () => {
    const n = recs().length;
    m.folders.removeFolder(db, folderId);
    expect(files()).toHaveLength(0);
    expect(recs().length).toBe(n);
    expect(fs.existsSync(path.join(watch, "Session", "a.mp4"))).toBe(true);
  });
});
