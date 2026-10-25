import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// The judge lock also covers visual indexing of approved recordings (ADR 0022), on a throwaway data dir.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-lock-visual-"));
process.env.METAL_DATA_DIR = dir;
process.env.METAL_JUDGE_DEMO = path.join(dir, "judge-demo.json");
const APPROVED = "rec_aaaaaaaaaaaaaaaa";
const OTHER = "rec_bbbbbbbbbbbbbbbb";
fs.writeFileSync(process.env.METAL_JUDGE_DEMO, JSON.stringify({ recordings: [APPROVED], lock: true }));

const req = () => new Request("http://localhost/api", { method: "POST", headers: { "x-metal-action": "1" } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("judge lock on visual indexing", () => {
  let schema: typeof import("../db/schema");
  let db: Awaited<ReturnType<typeof import("../db/client")["getDb"]>>;
  beforeAll(async () => {
    db = (await import("../db/client")).getDb();
    schema = await import("../db/schema");
    for (const id of [APPROVED, OTHER]) db.insert(schema.recordings).values({ id, title: id, originalPath: `${id}/original.mp4`, originalFilename: "x.mp4", status: "ready" }).run();
  });

  it("refuses indexing an approved recording and leaves no index row", async () => {
    const route = await import("@/app/api/recordings/[id]/visual/route");
    expect((await route.POST(req(), ctx(APPROVED))).status).toBe(423);
    expect(db.select().from(schema.recordingVisualIndex).all()).toEqual([]);
  });

  it("does not lock other recordings", async () => {
    const route = await import("@/app/api/recordings/[id]/visual/route");
    // Not 423: either queued, or 409 when the CLIP model isn't installed on this machine.
    expect([202, 409]).toContain((await route.POST(req(), ctx(OTHER))).status);
  });
});
