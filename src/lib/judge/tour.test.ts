import { describe, expect, it } from "vitest";
import { onStep, tourSteps } from "./tour";

const full = { recallLine: "Did that bug just die?", nightId: "ses_1", povGroupId: "pov_1", povRecordingId: "rec_a", storyId: "sty_1" };
const empty = { recallLine: null, nightId: null, povGroupId: null, povRecordingId: null, storyId: null };

describe("tourSteps", () => {
  it("points every stop at real content when it exists", () => {
    expect(tourSteps(full).map((s) => s.href)).toEqual([
      "/recall?q=Did%20that%20bug%20just%20die%3F",
      "/sessions/ses_1",
      "/povs/pov_1?rec=rec_a",
      "/studio?story=sty_1",
    ]);
    expect(tourSteps(full)[0].tip).toContain("“Did that bug just die?”");
  });

  it("falls back to each feature's own page without inventing content", () => {
    const steps = tourSteps(empty);
    expect(steps.map((s) => s.href)).toEqual(["/recall", "/sessions", "/library", "/studio"]);
    expect(steps[2].tip).toMatch(/No synced POVs yet/);
  });
});

describe("onStep", () => {
  it("matches the step's section, not lookalike paths", () => {
    const [recall, night] = tourSteps(full);
    expect(onStep(recall, "/recall")).toBe(true);
    expect(onStep(night, "/sessions/ses_1")).toBe(true);
    expect(onStep(recall, "/recalls")).toBe(false);
    expect(onStep(recall, null)).toBe(false);
  });
});
