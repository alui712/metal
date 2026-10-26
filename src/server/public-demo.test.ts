import { describe, expect, it } from "vitest";
import { demoRefusal } from "./public-demo";

describe("public demo guard", () => {
  it("refuses every write, on any route", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"])
      for (const p of ["/api/recordings", "/api/stories/sty_x/export", "/api/recordings/rec_x/game", "/recall"]) expect(demoRefusal(m, p)).toMatch(/read-only/);
  });
  it("refuses local-machine reads (OBS, watched folders)", () => {
    for (const p of ["/api/capture/config", "/api/sources/folders"]) expect(demoRefusal("GET", p)).not.toBeNull();
  });
  it("lets reads through: search, media, pages", () => {
    for (const p of ["/api/recall", "/api/media/rec_x/proxy", "/api/visual-frames/vf_x", "/showcase", "/recall", "/api/capture"]) expect(demoRefusal("GET", p)).toBeNull();
    expect(demoRefusal("HEAD", "/api/media/rec_x/proxy")).toBeNull();
  });
});
