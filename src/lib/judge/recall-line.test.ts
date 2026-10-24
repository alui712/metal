import { describe, expect, it } from "vitest";
import { pickRecallLine } from "./recall-line";

describe("pickRecallLine", () => {
  it("takes the first short, clean line", () => {
    expect(pickRecallLine(["What happened?", "What the fuck is that thing?", "Did that bug just die?", "Is that your body?"])).toBe("Did that bug just die?");
  });

  it("skips repeated callouts and long lines", () => {
    expect(pickRecallLine(["Go, go, go, go, go!", "This is a very long line that keeps going and going on", "Wait, I gotta get a lamp."])).toBe("Wait, I gotta get a lamp.");
  });

  it("returns null when nothing qualifies", () => {
    expect(pickRecallLine(["No!", "  ", "Holy shit, what was that"])).toBeNull();
  });
});
