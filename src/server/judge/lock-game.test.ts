import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

// Setting a recording's game: explicit, privileged, and locked for approved judge-demo recordings.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-lock-game-"));
process.env.METAL_DATA_DIR = dir;
process.env.METAL_JUDGE_DEMO = path.join(dir, "judge-demo.json");
const APPROVED = "rec_aaaaaaaaaaaaaaaa";
const OTHER = "rec_bbbbbbbbbbbbbbbb";
fs.writeFileSync(process.env.METAL_JUDGE_DEMO, JSON.stringify({ recordings: [APPROVED], lock: true }));

const req = (body: unknown, headers: Record<string, string> = { "x-metal-action": "1" }) =>
  new Request("http://localhost/api", { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

describe("recording game route", () => {
  let schema: typeof import("../db/schema");
  let db: Awaited<ReturnType<typeof import("../db/client")["getDb"]>>;
  const game = (id: string) => db.select({ g: schema.recordings.game }).from(schema.recordings).where(eq(schema.recordings.id, id)).get()?.g;
  beforeAll(async () => {
    db = (await import("../db/client")).getDb();
    schema = await import("../db/schema");
    for (const id of [APPROVED, OTHER]) db.insert(schema.recordings).values({ id, title: id, originalPath: `${id}/original.mp4`, originalFilename: "x.mp4", status: "ready" }).run();
  });

  it("refuses changing an approved recording (423) and leaves it as it was", async () => {
    const route = await import("@/app/api/recordings/[id]/game/route");
    expect((await route.PUT(req({ game: "Valorant" }), ctx(APPROVED))).status).toBe(423);
    expect(game(APPROVED)).toBeNull();
  });

  it("needs the action header", async () => {
    const route = await import("@/app/api/recordings/[id]/game/route");
    expect((await route.PUT(req({ game: "Valorant" }, {}), ctx(OTHER))).status).toBe(403);
    expect(game(OTHER)).toBeNull();
  });

  it("stores the list name, reports genres, and clears", async () => {
    const route = await import("@/app/api/recordings/[id]/game/route");
    const res = await route.PUT(req({ game: " valorant " }), ctx(OTHER));
    expect(await res.json()).toEqual({ game: "Valorant", known: true, genres: ["first-person shooter", "tactical shooter"] });
    expect(game(OTHER)).toBe("Valorant");
    expect((await route.PUT(req({ game: 3 }), ctx(OTHER))).status).toBe(400);
    expect(await (await route.PUT(req({ game: null }), ctx(OTHER))).json()).toEqual({ game: null, known: false, genres: [] });
    expect(game(OTHER)).toBeNull();
  });
});
