import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs, workers } from "../db/schema";
import { newId } from "../ids";

export type Job = typeof jobs.$inferSelect;

/** A running job whose heartbeat is older than this is considered abandoned. */
export const STALE_JOB_MS = 60_000;
/** A worker whose heartbeat is older than this is shown as offline. */
export const WORKER_OFFLINE_MS = 10_000;

export function enqueueJob(
  db: Db,
  input: {
    kind: string;
    recordingId?: string | null;
    payload?: unknown;
    maxAttempts?: number;
  },
): Job {
  return db
    .insert(jobs)
    .values({
      id: newId("job"),
      kind: input.kind,
      recordingId: input.recordingId ?? null,
      payloadJson: JSON.stringify(input.payload ?? {}),
      maxAttempts: input.maxAttempts ?? 2,
    })
    .returning()
    .get();
}

/**
 * Atomically claims the oldest queued job. Also reclaims running jobs whose
 * worker stopped heartbeating (e.g. the worker process was killed).
 */
export function claimNextJob(db: Db, now = Date.now()): Job | undefined {
  return db.$client.transaction(() => {
    db.update(jobs)
      .set({ status: "queued", stage: null })
      .where(
        and(
          eq(jobs.status, "running"),
          sql`${jobs.heartbeatAt} < ${now - STALE_JOB_MS}`,
          sql`${jobs.attempts} < ${jobs.maxAttempts}`,
        ),
      )
      .run();
    db.update(jobs)
      .set({
        status: "failed",
        error: "Worker stopped responding",
        finishedAt: now,
      })
      .where(
        and(
          eq(jobs.status, "running"),
          sql`${jobs.heartbeatAt} < ${now - STALE_JOB_MS}`,
        ),
      )
      .run();

    const next = db
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.status, "queued"))
      .orderBy(jobs.createdAt, sql`rowid`)
      .limit(1)
      .get();
    if (!next) return undefined;

    return db
      .update(jobs)
      .set({
        status: "running",
        attempts: sql`${jobs.attempts} + 1`,
        startedAt: now,
        heartbeatAt: now,
        error: null,
      })
      .where(and(eq(jobs.id, next.id), eq(jobs.status, "queued")))
      .returning()
      .get();
  }).immediate();
}

export function reportProgress(
  db: Db,
  jobId: string,
  update: { stage?: string; progress?: number },
): void {
  db.update(jobs)
    .set({
      ...update,
      ...(update.progress !== undefined && {
        progress: Math.min(1, Math.max(0, update.progress)),
      }),
      heartbeatAt: Date.now(),
    })
    .where(eq(jobs.id, jobId))
    .run();
}

export function completeJob(db: Db, jobId: string): void {
  db.update(jobs)
    .set({ status: "succeeded", progress: 1, finishedAt: Date.now() })
    .where(eq(jobs.id, jobId))
    .run();
}

/** Requeues the job if attempts remain (and `retry` allows), otherwise marks it failed. */
export function failJob(db: Db, jobId: string, error: string, { retry = true } = {}): Job {
  const retries = retry ? sql`${jobs.attempts} < ${jobs.maxAttempts}` : sql`0`;
  return db
    .update(jobs)
    .set({
      status: sql`CASE WHEN ${retries} THEN 'queued' ELSE 'failed' END`,
      error,
      finishedAt: sql`CASE WHEN ${retries} THEN NULL ELSE ${Date.now()} END`,
    })
    .where(eq(jobs.id, jobId))
    .returning()
    .get();
}

export function workerHeartbeat(
  db: Db,
  worker: { id: string; pid: number; startedAt: number },
  currentJobId: string | null,
): void {
  const now = Date.now();
  db.insert(workers)
    .values({ ...worker, heartbeatAt: now, currentJobId })
    .onConflictDoUpdate({
      target: workers.id,
      set: { heartbeatAt: now, currentJobId },
    })
    .run();
}

export function removeWorker(db: Db, workerId: string): void {
  db.delete(workers).where(eq(workers.id, workerId)).run();
}

export function getLiveWorker(db: Db, now = Date.now()) {
  return db
    .select()
    .from(workers)
    .where(sql`${workers.heartbeatAt} >= ${now - WORKER_OFFLINE_MS}`)
    .orderBy(sql`${workers.heartbeatAt} DESC`)
    .limit(1)
    .get();
}
