import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "../db/client";
import { judgeLocked } from "./demo";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-judge-"));
const file = path.join(dir, "judge-demo.json");
const write = (lock: boolean) =>
  fs.writeFileSync(file, JSON.stringify({ night: "ses_1", recordings: ["rec_a"], pov: "pov_1", story: "sty_1", exports: ["exp_1"], lock }));

describe("judgeLocked", () => {
  const db = openDb(":memory:");
  process.env.METAL_JUDGE_DEMO = file;
  afterEach(() => fs.rmSync(file, { force: true }));

  it("allows every write when the lock is off or there is no approved list", () => {
    expect(judgeLocked(db, { recordings: ["rec_a"], regroup: true })).toBeNull();
    write(false);
    expect(judgeLocked(db, { recordings: ["rec_a"], sessions: ["ses_1"], stories: ["sty_1"], regroup: true })).toBeNull();
  });

  it("refuses writes that touch approved content, from any caller", () => {
    write(true);
    for (const t of [{ recordings: ["rec_a"] }, { sessions: [null, "ses_1"] }, { stories: ["sty_1"] }, { povs: ["pov_1"] }, { exports: ["exp_1"] }, { regroup: true }]) {
      expect(judgeLocked(db, t)?.status).toBe(423);
    }
  });

  it("leaves the rest of the library editable", () => {
    write(true);
    expect(judgeLocked(db, { recordings: ["rec_other", null], sessions: ["ses_2"], stories: ["sty_2"], exports: ["exp_2"] })).toBeNull();
  });
});
