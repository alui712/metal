import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

// Route-level check that the lock is wired into real write handlers, on a throwaway data dir.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-lock-"));
process.env.METAL_DATA_DIR = dir;
process.env.METAL_JUDGE_DEMO = path.join(dir, "judge-demo.json");
fs.writeFileSync(process.env.METAL_JUDGE_DEMO, JSON.stringify({ story: "sty_aaaaaaaaaaaaaaaa", lock: true }));

const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, headers: { "x-metal-action": "1", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("judge lock on write routes", () => {
  let db: Awaited<ReturnType<typeof import("../db/client")["getDb"]>>;
  let schema: typeof import("../db/schema");
  beforeAll(async () => {
    db = (await import("../db/client")).getDb();
    schema = await import("../db/schema");
    db.insert(schema.storyProjects).values([{ id: "sty_aaaaaaaaaaaaaaaa", title: "Approved", updatedAt: 1 }, { id: "sty_bbbbbbbbbbbbbbbb", title: "Other", updatedAt: 1 }]).run();
  });
  const title = (id: string) => db.select().from(schema.storyProjects).where(eq(schema.storyProjects.id, id)).get()?.title;

  it("refuses renaming, deleting and exporting the approved story", async () => {
    const story = await import("@/app/api/stories/[id]/route");
    const exp = await import("@/app/api/stories/[id]/export/route");
    expect((await story.PATCH(req("PATCH", { title: "Changed" }), ctx("sty_aaaaaaaaaaaaaaaa"))).status).toBe(423);
    expect((await story.DELETE(req("DELETE"), ctx("sty_aaaaaaaaaaaaaaaa"))).status).toBe(423);
    expect((await exp.POST(req("POST"), ctx("sty_aaaaaaaaaaaaaaaa"))).status).toBe(423);
    expect(title("sty_aaaaaaaaaaaaaaaa")).toBe("Approved");
  });

  it("refuses regrouping sessions, which could change the approved night", async () => {
    const sessions = await import("@/app/api/sessions/route");
    expect((await sessions.PATCH(req("PATCH", { gapMinutes: 60 }))).status).toBe(423);
  });

  it("keeps normal editing of everything else", async () => {
    const story = await import("@/app/api/stories/[id]/route");
    expect((await story.PATCH(req("PATCH", { title: "Renamed" }), ctx("sty_bbbbbbbbbbbbbbbb"))).status).toBe(200);
    expect(title("sty_bbbbbbbbbbbbbbbb")).toBe("Renamed");
  });
});
