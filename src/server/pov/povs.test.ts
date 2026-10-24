import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { coverage, nearestCovered, toGroupTime, toOwnTime } from "@/lib/pov/sync";
import { timeEvidence } from "./povs";
import { makePovSamples } from "./pov-samples";

describe("time mapping (pure)", () => {
  const a = { offsetMs: 0, durationMs: 40_000 };
  const b = { offsetMs: 12_250, durationMs: 34_000 };
  it("keeps the same moment when switching POVs", () => {
    const T = toGroupTime(a, 20_000);
    expect(toOwnTime(b, T)).toBe(7_750);
    expect(toGroupTime(b, toOwnTime(b, T))).toBe(T);
  });
  it("knows where each POV has footage, including the edges", () => {
    expect(coverage(b, 12_249)).toBe("before");
    expect(coverage(b, 12_250)).toBe("inside");
    expect(coverage(b, 46_250)).toBe("inside");
    expect(coverage(b, 46_251)).toBe("after");
    expect(nearestCovered(b, 5_000)).toBe(12_250);
    expect(nearestCovered(b, 60_000)).toBe(46_250);
  });
  it("reads clock evidence without inventing times", () => {
    const at = (iso: string) => new Date(iso).getTime();
    const A = { recordedAt: at("2026-10-20T21:00:04"), recordedAtSource: "filename" as const, durationMs: 40_000 };
    expect(timeEvidence(A, { recordedAt: at("2026-10-20T21:00:16"), recordedAtSource: "filename", durationMs: 34_000 })).toMatchObject({ kind: "overlap", clockOffsetMs: 12_000, approximate: false });
    expect(timeEvidence(A, { recordedAt: at("2026-10-20T21:01:30"), recordedAtSource: "file-date", durationMs: 5_000 })).toMatchObject({ kind: "near", approximate: true });
    expect(timeEvidence(A, { recordedAt: at("2026-10-20T23:00:00"), recordedAtSource: "filename", durationMs: 5_000 }).kind).toBe("apart");
    expect(timeEvidence(A, { recordedAt: null, recordedAtSource: null, durationMs: 5_000 }).kind).toBe("unknown");
  });
});

describe("Find other POVs, pairing and sync (real files, worker jobs)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "metal-povs-"));
  type M = {
    db: import("../db/client").Db;
    schema: typeof import("../db/schema");
    queue: typeof import("../jobs/queue");
    povs: typeof import("./povs");
    stories: typeof import("../studio/stories");
    handlers: Record<string, (ctx: import("../../worker/handlers").JobContext) => Promise<void>>;
  };
  let m: M;
  const ids: Record<string, string> = {};
  const urls = new Map<string, { posterUrl: string | null; videoUrl: string | null }>();

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

  beforeAll(async () => {
    process.env.METAL_DATA_DIR = path.join(tmp, "data");
    const src = path.join(tmp, "src");
    fs.mkdirSync(src);
    // One play: A and B share voice chat; B's 0:00 is 12.25 s into A. Their
    // file-name clocks say 12 s (clocks are whole seconds). D shares the same
    // voice chat but has no time. C overlaps in time with unrelated audio; E
    // is undated and unrelated.
    const files = makePovSamples(src, [
      { name: "2026-10-20 21-00-04 POV A", startS: 4, lenS: 40, fps: 30, size: "640x360", seed: 101 },
      { name: "2026-10-20 21-00-16 POV B", startS: 16.25, lenS: 34, fps: 60, size: "854x480", seed: 202 },
      { name: "teammate D", startS: 20, lenS: 25, fps: 30, size: "640x360", seed: 404 },
    ]);
    files.push(...makePovSamples(src, [{ name: "2026-10-20 21-00-10 other C", startS: 0, lenS: 30, fps: 30, size: "640x360", seed: 303 }], 777));
    files.push(...makePovSamples(src, [{ name: "unrelated E", startS: 0, lenS: 30, fps: 30, size: "640x360", seed: 505 }], 888));
    const { openDb } = await import("../db/client");
    const { receiveUpload } = await import("../media/upload");
    m = {
      db: openDb(":memory:"),
      schema: await import("../db/schema"),
      queue: await import("../jobs/queue"),
      povs: await import("./povs"),
      stories: await import("../studio/stories"),
      handlers: (await import("../../worker/handlers")).handlers,
    };
    for (const f of files) {
      const name = path.basename(f.file);
      const key = /POV (\w)|other (\w)|teammate (\w)|unrelated (\w)/.exec(name)!.slice(1).find(Boolean)!;
      ids[key] = (await receiveUpload(m.db, { body: Readable.toWeb(fs.createReadStream(f.file)) as ReadableStream<Uint8Array>, filename: name })).id;
      urls.set(ids[key], { posterUrl: null, videoUrl: `/api/media/${ids[key]}/video` });
    }
    await runJobs();
    // A Smart Clip cut from A: same footage, so never "another POV" (even though its audio matches).
    const a = m.db.select().from(m.schema.recordings).where(eq(m.schema.recordings.id, ids.A)).get()!;
    m.db.insert(m.schema.recordings).values({ ...a, id: "rec_c11c11c11c11c11c", contentHash: null, origin: "clip", parentRecordingId: a.id, parentStartMs: 0, title: "Clip of A" }).run();
  }, 240_000);
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("suggests POVs only from evidence, refining clocks with shared audio", async () => {
    const before = m.povs.povView(m.db, ids.A, urls)!;
    // Before listening: clocks only — B and C overlap in time, both just "possible".
    expect(before.candidates.map((c) => [c.recordingId, c.confidence, c.suggested?.source])).toEqual(
      expect.arrayContaining([
        [ids.B, "possible", "clock"],
        [ids.C, "possible", "clock"],
      ]),
    );
    expect(before.candidates.some((c) => c.recordingId === ids.D || c.recordingId === ids.E)).toBe(false);

    expect(m.povs.requestPovMatch(m.db, ids.A)).toBe("queued");
    expect(m.povs.requestPovMatch(m.db, ids.A)).toBe("busy");
    await runJobs();
    const v = m.povs.povView(m.db, ids.A, urls)!;
    const by = (id: string) => v.candidates.find((c) => c.recordingId === id);
    expect(by(ids.B)).toMatchObject({ confidence: "likely", suggested: { source: "audio" }, audio: { status: "reliable" } });
    expect(Math.abs(by(ids.B)!.suggested!.offsetMs - 12_250)).toBeLessThanOrEqual(30);
    // Overlapping clocks but different audio: still only "possible", never "likely".
    expect(by(ids.C)).toMatchObject({ confidence: "possible", suggested: { source: "clock" } });
    expect(by(ids.C)!.audio!.status).not.toBe("reliable");
    // Undated D matches by audio alone (16 s after A's start); undated E doesn't and isn't listed.
    expect(by(ids.D)).toMatchObject({ confidence: "likely", time: { kind: "unknown" } });
    expect(Math.abs(by(ids.D)!.suggested!.offsetMs - 16_000)).toBeLessThanOrEqual(30);
    expect(by(ids.E)).toBeUndefined();
    expect(v.undatedChecked).toBe(1);
    expect(v.candidates.some((c) => c.title === "Clip of A")).toBe(false);
    expect(v.candidates[0].confidence).toBe("likely");
  }, 120_000);

  it("pairs, adjusts and confirms sync, merges groups, and unpairs without touching recordings", () => {
    const b = m.povs.povView(m.db, ids.A, urls)!.candidates.find((c) => c.recordingId === ids.B)!;
    const r = m.povs.pairPov(m.db, { recordingId: ids.A, otherId: ids.B, offsetMs: b.suggested!.offsetMs, source: "audio", audioScore: b.audio!.score });
    expect("groupId" in r).toBe(true);
    const gid = (r as { groupId: string }).groupId;
    let g = m.povs.groupView(m.db, gid, urls)!;
    expect(g.members.map((x) => [x.recordingId, x.syncSource, x.syncConfirmed])).toEqual([
      [ids.A, "anchor", true],
      [ids.B, "audio", false],
    ]);
    expect(g.startMs).toBe(0);
    expect(g.endMs).toBe(Math.max(40_000, g.members[1].offsetMs + g.members[1].durationMs));

    // Manual pairing of D, from B's side, with a rough offset; the user then nudges it.
    m.povs.pairPov(m.db, { recordingId: ids.B, otherId: ids.D, offsetMs: 3_000, source: "manual" });
    g = m.povs.groupView(m.db, gid, urls)!;
    const d = g.members.find((x) => x.recordingId === ids.D)!;
    expect(d.offsetMs).toBe(g.members.find((x) => x.recordingId === ids.B)!.offsetMs + 3_000);
    expect(d).toMatchObject({ syncSource: "manual", syncConfirmed: false });
    m.povs.setPovOffset(m.db, ids.D, 16_000);
    expect(m.povs.groupView(m.db, gid, urls)!.members.find((x) => x.recordingId === ids.D)).toMatchObject({ offsetMs: 16_000, syncSource: "manual", syncConfirmed: true });
    m.povs.confirmPovSync(m.db, ids.B);
    expect(m.povs.groupView(m.db, gid, urls)!.members.find((x) => x.recordingId === ids.B)!.syncConfirmed).toBe(true);

    // C and E form their own group, then merge into A's: offsets shift together.
    const r2 = m.povs.pairPov(m.db, { recordingId: ids.C, otherId: ids.E, offsetMs: 5_000, source: "manual" }) as { groupId: string };
    m.povs.pairPov(m.db, { recordingId: ids.A, otherId: ids.C, offsetMs: 6_000, source: "clock" });
    g = m.povs.groupView(m.db, gid, urls)!;
    expect(m.povs.groupView(m.db, r2.groupId, urls)).toBeNull();
    expect(g.members.find((x) => x.recordingId === ids.C)!.offsetMs).toBe(6_000);
    expect(g.members.find((x) => x.recordingId === ids.E)!.offsetMs).toBe(11_000);
    expect(g.members).toHaveLength(5);

    // Never pairs a recording with itself.
    expect(m.povs.pairPov(m.db, { recordingId: ids.A, otherId: ids.A, offsetMs: 0, source: "manual" })).toMatchObject({ status: 400 });

    m.povs.setPlayerName(m.db, ids.B, "  Mira  ");
    expect(m.povs.groupView(m.db, gid, urls)!.members.find((x) => x.recordingId === ids.B)!.playerName).toBe("Mira");

    for (const id of [ids.C, ids.E, ids.D]) m.povs.unpairPov(m.db, id);
    expect(m.povs.unpairPov(m.db, ids.B)).toEqual({ groupId: null });
    expect(m.povs.groupView(m.db, gid, urls)).toBeNull();
    expect(m.db.select().from(m.schema.recordings).all()).toHaveLength(6);
  });

  it("hands a POV moment to Story Studio with its exact source and range", () => {
    const g = m.povs.pairPov(m.db, { recordingId: ids.A, otherId: ids.B, offsetMs: 12_250, source: "audio" }) as { groupId: string };
    const B = m.povs.groupView(m.db, g.groupId, urls)!.members.find((x) => x.recordingId === ids.B)!;
    // The same moment the viewer showed in A at 0:20 → B's own time.
    const own = toOwnTime(B, toGroupTime({ offsetMs: 0, durationMs: 40_000 }, 20_000));
    const s = m.stories.createStory(m.db, { sessionId: null, ranges: [{ recordingId: ids.B, inMs: own - 4_000, outMs: own + 6_000 }], title: "Mira POV" });
    const clip = m.db.select().from(m.schema.storyClips).where(eq(m.schema.storyClips.projectId, (s as { id: string }).id)).get()!;
    expect(clip).toMatchObject({ recordingId: ids.B, inMs: 3_750, outMs: 13_750 });
  });
});
