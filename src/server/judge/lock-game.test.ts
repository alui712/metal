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
const NIGHT = "ses_cccccccccccccccc";
const IN_NIGHT = "rec_cccccccccccccccc";
const T = Date.UTC(2026, 9, 24, 20);
const A = "rec_dddddddddddddddd";
const B = "rec_eeeeeeeeeeeeeeee";
fs.writeFileSync(process.env.METAL_JUDGE_DEMO, JSON.stringify({ recordings: [APPROVED], night: NIGHT, lock: true }));

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
    db.insert(schema.sessions).values({ id: NIGHT, startedAt: T, endedAt: T + 60_000 }).run();
    db.insert(schema.recordings).values({ id: IN_NIGHT, title: "x", originalPath: "x/o.mp4", originalFilename: "x.mp4", status: "ready", sessionId: NIGHT }).run();
    // Two recordings a minute apart: one automatic session.
    for (const [id, at] of [[A, T + 86_400_000], [B, T + 86_460_000]] as const)
      db.insert(schema.recordings).values({ id, title: id, originalPath: `${id}/o.mp4`, originalFilename: "o.mp4", status: "ready", recordedAt: at, durationMs: 30_000 }).run();
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

  it("refuses recordings in the approved night too (setting a game would regroup it)", async () => {
    const route = await import("@/app/api/recordings/[id]/game/route");
    expect((await route.PUT(req({ game: "Valorant" }), ctx(IN_NIGHT))).status).toBe(423);
    expect(game(IN_NIGHT)).toBeNull();
  });

  it("setting different games keeps the night grouped as it was", async () => {
    const route = await import("@/app/api/recordings/[id]/game/route");
    const { syncSessions } = await import("../timemachine/sessions");
    syncSessions(db);
    const session = (id: string) => db.select({ s: schema.recordings.sessionId }).from(schema.recordings).where(eq(schema.recordings.id, id)).get()?.s;
    const before = session(A);
    expect(before).toBeTruthy();
    expect(session(B)).toBe(before);
    expect((await route.PUT(req({ game: "Valorant" }), ctx(A))).status).toBe(200);
    expect((await route.PUT(req({ game: "Overwatch 2" }), ctx(B))).status).toBe(200);
    syncSessions(db);
    expect([session(A), session(B)]).toEqual([before, before]);
    expect(db.select({ l: schema.sessions.locked }).from(schema.sessions).where(eq(schema.sessions.id, before!)).get()?.l).toBe(true);
  });
});
