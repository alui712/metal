import { describe, expect, it } from "vitest";
import { dockHidden, onStep, tourSteps, type TourTargets } from "./tour";

const full: TourTargets = {
  recallLine: "Did that bug just die?",
  night: { id: "ses_1", title: "Saturday evening" },
  pov: { groupId: "pov_1", recordingId: "rec_a", members: 2, status: "confirmed", method: "manual" },
  story: { id: "sty_1", clipCount: 3, exported: false },
};
const empty: TourTargets = { recallLine: null, night: null, pov: null, story: null };
const params = (s: string) => new URLSearchParams(s);

describe("tourSteps", () => {
  it("points every stop at the approved content", () => {
    expect(tourSteps(full).map((s) => s.href)).toEqual([
      "/recall?q=Did%20that%20bug%20just%20die%3F",
      "/sessions/ses_1",
      "/povs/pov_1?rec=rec_a",
      "/studio?story=sty_1",
    ]);
    expect(tourSteps(full)[0].tip).toContain("“Did that bug just die?”");
    expect(tourSteps(full)[1].tip).toContain("Saturday evening");
    expect(tourSteps(full)[3].tip).toContain("3 clips");
  });

  it("describes how a POV pair was really synced", () => {
    const manual = tourSteps(full)[2].tip;
    expect(manual).toContain("lined up by hand and confirmed");
    expect(manual).not.toMatch(/audio/);
    expect(manual).toContain("Press 1 or 2");

    const suggested = tourSteps({ ...full, pov: { ...full.pov!, status: "suggested", method: "audio", members: 3 } })[2].tip;
    expect(suggested).toContain("shared game audio (suggested, not confirmed)");
    expect(suggested).not.toContain("and confirmed");
    expect(suggested).toContain("Press 1–3");
  });

  it("falls back to each feature's own page and says nothing is prepared", () => {
    const steps = tourSteps(empty);
    expect(steps.map((s) => s.href)).toEqual(["/recall", "/sessions", "/library", "/studio"]);
    for (const s of steps) expect(s.tip).toMatch(/^No demo .* is prepared\./);
  });
});

describe("onStep", () => {
  const [recall, night, pov, studio] = tourSteps(full);

  it("matches the intended destination, not just the section", () => {
    expect(onStep(recall, "/recall", params("q=Did that bug just die?"))).toBe(true);
    expect(onStep(recall, "/recall", params("q=something else"))).toBe(false);
    expect(onStep(recall, "/recall/demo", params("q=Did that bug just die?"))).toBe(false);
    expect(onStep(night, "/sessions/ses_1", null)).toBe(true);
    expect(onStep(night, "/sessions/ses_2", null)).toBe(false);
    expect(onStep(night, "/sessions", null)).toBe(false);
    expect(onStep(pov, "/povs/pov_1", params("rec=rec_b"))).toBe(true);
    expect(onStep(pov, "/povs/pov_9", null)).toBe(false);
    expect(onStep(studio, "/studio", params("story=sty_1"))).toBe(true);
    expect(onStep(studio, "/studio", params("story=sty_2"))).toBe(false);
    expect(onStep(studio, "/studio", null)).toBe(false);
    expect(onStep(recall, null)).toBe(false);
  });

  it("counts the night's Relive as part of the night stop", () => {
    expect(onStep(night, "/sessions/ses_1/relive", null)).toBe(true);
    expect(onStep(night, "/sessions/ses_2/relive", null)).toBe(false);
  });

  it("matches fallback stops by their index page", () => {
    const steps = tourSteps(empty);
    expect(onStep(steps[0], "/recall", params("q=anything"))).toBe(true);
    expect(onStep(steps[2], "/library", null)).toBe(true);
  });
});

describe("dockHidden", () => {
  it("hides the dock only over full-screen Relive", () => {
    expect(dockHidden("/sessions/ses_1/relive")).toBe(true);
    expect(dockHidden("/sessions/ses_1")).toBe(false);
    expect(dockHidden("/sessions/demo")).toBe(false);
    expect(dockHidden(null)).toBe(false);
  });
});
