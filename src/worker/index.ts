import { getDb } from "../server/db/client";
import { newId } from "../server/ids";
import {
  claimNextJob,
  completeJob,
  failJob,
  removeWorker,
  reportProgress,
  workerHeartbeat,
} from "../server/jobs/queue";
import { PermanentJobError } from "../server/jobs/errors";
import { handlers } from "./handlers";

const POLL_MS = 1000;
const HEARTBEAT_MS = 2000;

const db = getDb();
const worker = { id: newId("wrk"), pid: process.pid, startedAt: Date.now() };
const shutdown = new AbortController();
let currentJobId: string | null = null;

function log(message: string) {
  console.log(`[worker ${new Date().toISOString()}] ${message}`);
}

const heartbeat = setInterval(() => {
  workerHeartbeat(db, worker, currentJobId);
  if (currentJobId) reportProgress(db, currentJobId, {});
}, HEARTBEAT_MS);
workerHeartbeat(db, worker, null);

async function runOnce(): Promise<boolean> {
  const job = claimNextJob(db);
  if (!job) return false;
  currentJobId = job.id;
  workerHeartbeat(db, worker, job.id);
  log(`start ${job.kind} ${job.id} (attempt ${job.attempts})`);

  const handler = handlers[job.kind];
  try {
    if (!handler) throw new Error(`No handler registered for "${job.kind}"`);
    await handler({
      db,
      job,
      progress: (update) => reportProgress(db, job.id, update),
      signal: shutdown.signal,
    });
    completeJob(db, job.id);
    log(`done  ${job.kind} ${job.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const after = failJob(db, job.id, message, { retry: !(err instanceof PermanentJobError) });
    log(`fail  ${job.kind} ${job.id} → ${after.status}: ${message}`);
  } finally {
    currentJobId = null;
  }
  return true;
}

async function main() {
  log(`online (pid ${process.pid}, ${Object.keys(handlers).length} handlers)`);
  while (!shutdown.signal.aborted) {
    const didWork = await runOnce();
    if (!didWork) await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function stop() {
  if (shutdown.signal.aborted) process.exit(1);
  log("shutting down…");
  shutdown.abort();
  clearInterval(heartbeat);
  removeWorker(db, worker.id);
  // An in-flight job is left "running"; its stale heartbeat lets the next
  // worker reclaim it.
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
