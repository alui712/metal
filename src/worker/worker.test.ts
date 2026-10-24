import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDb, type Db } from "../server/db/client";
import { enqueueJob } from "../server/jobs/queue";

// Runs the real worker process against a temp database.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-worker-"));
let worker: ChildProcess;
let db: Db;
let output = "";

async function waitFor<T>(fn: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out. Worker output:\n${output}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

beforeAll(async () => {
  worker = spawn(
    process.execPath,
    [path.join("node_modules", "tsx", "dist", "cli.mjs"), "src/worker/index.ts"],
    { env: { ...process.env, METAL_DATA_DIR: dataDir }, stdio: "pipe" },
  );
  worker.stdout?.on("data", (d) => (output += d));
  worker.stderr?.on("data", (d) => (output += d));
  await waitFor(() => output.includes("online") || undefined, 20_000);
  db = openDb(path.join(dataDir, "metal.db"));
}, 30_000);

afterAll(() => {
  worker?.kill("SIGKILL");
  db?.$client.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe("worker process", () => {
  it("migrates the database and registers a heartbeat", async () => {
    const row = await waitFor(() => db.query.workers.findFirst().sync());
    // tsx runs the script in a child process, so compare against its log line.
    expect(output).toContain(`online (pid ${row.pid},`);
  });

  it("fails jobs with no registered handler, with a clear error", async () => {
    const job = enqueueJob(db, { kind: "does-not-exist", maxAttempts: 1 });
    const done = await waitFor(() => {
      const r = db.query.jobs.findFirst({ where: (j, { eq }) => eq(j.id, job.id) }).sync();
      return r?.status === "failed" ? r : undefined;
    });
    expect(done.error).toBe('No handler registered for "does-not-exist"');
    expect(done.attempts).toBe(1);
  });

  it("shuts down cleanly on SIGINT and removes its heartbeat", async () => {
    const exited = new Promise<number | null>((r) => worker.on("exit", r));
    worker.kill("SIGINT");
    expect(await exited).toBe(0);
    expect(db.query.workers.findFirst().sync()).toBeUndefined();
  });
});
