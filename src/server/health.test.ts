import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HealthCheck } from "./health";

// Config is read at import time, so point it at a temp data dir and
// controlled binaries before importing the module under test.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-health-"));
let checks: HealthCheck[];

beforeAll(async () => {
  process.env.METAL_DATA_DIR = dataDir;
  process.env.FFMPEG_PATH = "/bin/echo";
  process.env.FFPROBE_PATH = "/nonexistent/ffprobe";
  process.env.WHISPER_PATH = "/nonexistent/whisper-cli";
  process.env.ANTHROPIC_API_KEY = "";
  const { runHealthChecks } = await import("./health");
  checks = await runHealthChecks();
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const byId = (id: string) => checks.find((c) => c.id === id)!;

describe("health checks", () => {
  it("creates and opens the library database", () => {
    expect(byId("storage").state).toBe("ok");
    expect(byId("storage").detail).toContain("0 recordings");
    expect(fs.existsSync(path.join(dataDir, "metal.db"))).toBe(true);
  });

  it("reports a missing ffprobe as an error with a fix", () => {
    const ffmpeg = byId("ffmpeg");
    expect(ffmpeg.state).toBe("error");
    expect(ffmpeg.detail).toBe("ffprobe not found");
    expect(ffmpeg.fix).toBe("brew install ffmpeg");
  });

  it("degrades (not errors) when optional AI services are missing", () => {
    expect(byId("whisper").state).toBe("warn");
    expect(byId("anthropic").state).toBe("warn");
    expect(byId("anthropic").detail).toBe("ANTHROPIC_API_KEY not set");
  });

  it("reports the worker offline when none is heartbeating", () => {
    expect(byId("worker").state).toBe("error");
  });

  it("never includes secret values in its output", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-secret";
    const { runHealthChecks } = await import("./health");
    const out = JSON.stringify(await runHealthChecks());
    expect(out).not.toContain("sk-ant-test-secret");
    expect(out).toContain("API key configured");
  });
});
