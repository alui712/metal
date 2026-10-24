import { describe, expect, it } from "vitest";
import { curate, judgeDemoSchema, type DemoFacts } from "./curate";

const rec = (id: string, title = id, playable = true, hasPoster = true) => [id, { id, title, playable, hasPoster, durationMs: 20_000 }] as const;

function facts(over: Partial<DemoFacts> = {}): DemoFacts {
  return {
    recordings: new Map([rec("rec_a", "peak pov"), rec("rec_b", "peak pov 2"), rec("rec_x", "unapproved"), rec("rec_broken", "broken", false)]),
    sessions: new Map([["ses_1", { id: "ses_1", title: "Saturday evening" }]]),
    lines: [
      { text: "Holy cow, unapproved line", recordingId: "rec_x", startMs: 0 },
      { text: "Did that bug just die?", recordingId: "rec_a", startMs: 4000 },
    ],
    povGroups: new Map([
      [
        "pov_1",
        [
          { recordingId: "rec_b", offsetMs: 700, syncSource: "manual", confirmed: true },
          { recordingId: "rec_a", offsetMs: -1800, syncSource: "anchor", confirmed: true },
        ],
      ],
    ]),
    stories: new Map([
      ["sty_ok", { id: "sty_ok", title: "Best of Saturday", clipRecordingIds: ["rec_a", "rec_b"], exported: true }],
      ["sty_leak", { id: "sty_leak", title: "Mixed", clipRecordingIds: ["rec_a", "rec_x"], exported: false }],
    ]),
    ...over,
  };
}

const config = (over: object = {}) =>
  judgeDemoSchema.parse({ night: "ses_1", recordings: [{ id: "rec_a", label: "Cave run" }, "rec_b"], recall: ["did that bug just die"], pov: "pov_1", story: "sty_ok", ...over });

describe("curate", () => {
  it("uses only approved, verified content", () => {
    const c = curate(config(), facts());
    expect(c.nightId).toBe("ses_1");
    expect(c.recordings).toEqual([
      { id: "rec_a", label: "Cave run", durationMs: 20_000 },
      { id: "rec_b", label: null, durationMs: 20_000 },
    ]);
    expect(c.recall).toEqual({ line: "Did that bug just die?", recordingId: "rec_a", startMs: 4000 });
    expect(c.story).toEqual({ id: "sty_ok", title: "Best of Saturday", clipCount: 2, exported: true });
    expect(c.checks.every((x) => x.ready)).toBe(true);
  });

  it("orders POV members by offset and reports how they were synced", () => {
    const { pov } = curate(config(), facts());
    expect(pov).toMatchObject({ groupId: "pov_1", firstRecordingId: "rec_a", status: "confirmed", method: "manual" });
    expect(pov!.members.map((m) => m.label)).toEqual(["Cave run", "peak pov 2"]);
  });

  it("never calls a suggested sync confirmed", () => {
    const f = facts();
    f.povGroups.set("pov_1", [
      { recordingId: "rec_a", offsetMs: 0, syncSource: "anchor", confirmed: true },
      { recordingId: "rec_b", offsetMs: 700, syncSource: "audio", confirmed: false },
    ]);
    expect(curate(config(), f).pov).toMatchObject({ status: "suggested", method: "audio" });
  });

  it("does not fall back to other content when an approved item fails", () => {
    const c = curate(config({ story: "sty_leak", recall: ["Holy cow, unapproved line"], night: "ses_gone" }), facts());
    expect(c.story).toBeNull();
    expect(c.recall).toBeNull();
    expect(c.nightId).toBeNull();
    expect(c.checks.filter((x) => !x.ready).map((x) => x.area).sort()).toEqual(["night", "recall", "story"]);
  });

  it("drops unplayable recordings and POV groups that include them", () => {
    const f = facts();
    f.povGroups.set("pov_2", [
      { recordingId: "rec_a", offsetMs: 0, syncSource: "anchor", confirmed: true },
      { recordingId: "rec_broken", offsetMs: 10, syncSource: "manual", confirmed: true },
    ]);
    const c = curate(config({ recordings: ["rec_a", "rec_broken"], pov: "pov_2" }), f);
    expect(c.recordings.map((r) => r.id)).toEqual(["rec_a"]);
    expect(c.pov).toBeNull();
    expect(c.checks.find((x) => x.ref === "rec_broken")).toMatchObject({ ready: false, detail: "broken: video not playable" });
  });

  it("shows nothing without an approved list", () => {
    const c = curate(null, facts());
    expect(c).toMatchObject({ nightId: null, recordings: [], recall: null, pov: null, story: null });
    expect(c.checks).toEqual([expect.objectContaining({ area: "config", ready: false })]);
  });
});
