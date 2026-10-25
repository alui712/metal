import { describe, expect, it } from "vitest";
import { openDb } from "../db/client";
import { recordings } from "../db/schema";
import { confirmPovSync, listPovGroups, pairPov } from "./povs";

// The Multi-POV landing page: real groups only, newest edit first.

describe("listPovGroups", () => {
  const setup = () => {
    const db = openDb(":memory:");
    for (const [id, dur] of [["rec_a", 40_000], ["rec_b", 34_000], ["rec_c", 20_000], ["rec_d", 5_000]] as const)
      db.insert(recordings).values({ id, title: id, originalPath: `${id}/o.mp4`, originalFilename: "x.mp4", status: "ready", durationMs: dur, game: "PEAK" }).run();
    const urls = new Map([["rec_a", { posterUrl: "/p/a", videoUrl: "/v/a" }]]);
    return { db, urls };
  };

  it("is empty without pairs", () => {
    const { db, urls } = setup();
    expect(listPovGroups(db, urls)).toEqual([]);
  });

  it("lists each group with its members, shared footage, sync state and method", () => {
    const { db, urls } = setup();
    const g1 = pairPov(db, { recordingId: "rec_a", otherId: "rec_b", offsetMs: 12_250, source: "audio", audioScore: 0.8 });
    if ("error" in g1) throw new Error(g1.error);
    const [one] = listPovGroups(db, urls);
    expect(one.id).toBe(g1.groupId);
    expect(one.members.map((m) => m.recordingId)).toEqual(["rec_a", "rec_b"]);
    expect(one.members[0].posterUrl).toBe("/p/a");
    // a: 0–40 000, b: 12 250–46 250 → both have footage for 27 750 ms.
    expect(one.sharedMs).toBe(27_750);
    expect(one).toMatchObject({ confirmed: false, method: "audio", startMs: 0, endMs: 46_250 });
    confirmPovSync(db, "rec_b");
    expect(listPovGroups(db, urls)[0].confirmed).toBe(true);
  });

  it("orders by last edit and reports clips that never all overlap", async () => {
    const { db, urls } = setup();
    pairPov(db, { recordingId: "rec_a", otherId: "rec_b", offsetMs: 0, source: "manual" });
    await new Promise((r) => setTimeout(r, 5));
    const g2 = pairPov(db, { recordingId: "rec_c", otherId: "rec_d", offsetMs: 30_000, source: "clock" });
    if ("error" in g2) throw new Error(g2.error);
    const list = listPovGroups(db, urls);
    expect(list.map((g) => g.id)[0]).toBe(g2.groupId);
    expect(list[0]).toMatchObject({ sharedMs: 0, method: "clock" });
    expect(list[1].method).toBe("manual");
  });
});
