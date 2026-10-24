import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client";
import {
  STALE_JOB_MS,
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  getLiveWorker,
  reportProgress,
  workerHeartbeat,
} from "./queue";

let db: Db;

beforeEach(() => {
  db = openDb(":memory:");
});

describe("job queue", () => {
  it("claims jobs oldest-first and only once", () => {
    const a = enqueueJob(db, { kind: "test" });
    const b = enqueueJob(db, { kind: "test" });

    const first = claimNextJob(db);
    expect(first?.id).toBe(a.id);
    expect(first?.status).toBe("running");
    expect(first?.attempts).toBe(1);

    expect(claimNextJob(db)?.id).toBe(b.id);
    expect(claimNextJob(db)).toBeUndefined();
  });

  it("clamps progress and completes", () => {
    const job = enqueueJob(db, { kind: "test" });
    claimNextJob(db);
    reportProgress(db, job.id, { stage: "probe", progress: 4 });
    completeJob(db, job.id);
    const row = db.query.jobs.findFirst({ where: (j, { eq }) => eq(j.id, job.id) }).sync();
    expect(row?.status).toBe("succeeded");
    expect(row?.progress).toBe(1);
  });

  it("retries until max attempts, then fails", () => {
    const job = enqueueJob(db, { kind: "test", maxAttempts: 2 });
    claimNextJob(db);
    expect(failJob(db, job.id, "boom").status).toBe("queued");
    claimNextJob(db);
    const final = failJob(db, job.id, "boom again");
    expect(final.status).toBe("failed");
    expect(final.error).toBe("boom again");
    expect(final.finishedAt).not.toBeNull();
  });

  it("reclaims running jobs whose heartbeat went stale", () => {
    const job = enqueueJob(db, { kind: "test", maxAttempts: 2 });
    const start = Date.now();
    claimNextJob(db, start);
    const later = start + STALE_JOB_MS + 1;
    const reclaimed = claimNextJob(db, later);
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.attempts).toBe(2);

    // Out of attempts: a second stall marks it failed instead.
    expect(claimNextJob(db, later + STALE_JOB_MS + 1)).toBeUndefined();
    const row = db.query.jobs.findFirst().sync();
    expect(row?.status).toBe("failed");
  });

  it("reports live workers by heartbeat", () => {
    const w = { id: "wrk_1", pid: 123, startedAt: Date.now() };
    expect(getLiveWorker(db)).toBeUndefined();
    workerHeartbeat(db, w, null);
    expect(getLiveWorker(db)?.pid).toBe(123);
    expect(getLiveWorker(db, Date.now() + 60_000)).toBeUndefined();
  });
});

describe("chunk full-text index", () => {
  it("stays in sync with the chunks table", () => {
    const sqlite = db.$client;
    sqlite
      .prepare(
        "INSERT INTO recordings (id, title, original_path, original_filename) VALUES ('rec_1', 't', '/x', 'x.mp4')",
      )
      .run();
    sqlite
      .prepare(
        "INSERT INTO chunks (id, recording_id, source, start_ms, end_ms, text) VALUES ('c1', 'rec_1', 'transcript', 0, 1000, 'what a clutch in the final round')",
      )
      .run();
    const match = sqlite
      .prepare(
        "SELECT c.id FROM chunks_fts f JOIN chunks c ON c.rowid = f.rowid WHERE chunks_fts MATCH ?",
      )
      .all("clutching");
    expect(match).toEqual([{ id: "c1" }]);

    sqlite.prepare("DELETE FROM chunks WHERE id = 'c1'").run();
    expect(
      sqlite.prepare("SELECT count(*) n FROM chunks_fts WHERE chunks_fts MATCH 'clutch'").get(),
    ).toEqual({ n: 0 });
  });
});
