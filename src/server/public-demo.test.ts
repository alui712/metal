import { describe, expect, it } from "vitest";
import { demoRefusal, demoRoute } from "./public-demo";

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

describe("fixture demo (Vercel)", () => {
  const sp = (s = "") => new URLSearchParams(s);
  it("refuses every API except the shell's capture status and health", () => {
    for (const p of ["/api/recall", "/api/media/rec_x/video", "/api/exports/exp_x", "/api/stories", "/api/visual-frames/x", "/api/recordings"]) expect(demoRefusal("GET", p, true)).not.toBeNull();
    for (const p of ["/api/capture", "/api/health"]) expect(demoRefusal("GET", p, true)).toBeNull();
    expect(demoRefusal("POST", "/api/capture", true)).toMatch(/read-only/);
  });
  it("sends real-library pages to their fixture versions", () => {
    expect(demoRoute("/recall", sp("q=bug"), true)).toEqual({ redirect: "/recall/demo?q=bug" });
    expect(demoRoute("/recall", sp(), true)).toEqual({ redirect: "/recall/demo" });
    expect(demoRoute("/sessions", sp(), true)).toEqual({ redirect: "/sessions/demo" });
    expect(demoRoute("/povs", sp(), true)).toEqual({ redirect: "/povs/demo" });
    expect(demoRoute("/povs/pov_abc", sp("judge=1"), true)).toEqual({ redirect: "/povs/demo" });
    expect(demoRoute("/studio", sp("story=sty_x"), true)).toEqual({ redirect: "/studio?demo=1" });
    for (const p of ["/clips", "/status", "/recordings/rec_x", "/import"]) expect(demoRoute(p, sp(), true)).toEqual({ redirect: "/local-only" });
  });
  it("serves fixture pages as they are", () => {
    for (const [p, q] of [["/povs/demo", ""], ["/recall/demo", "q=x"], ["/sessions/demo", ""], ["/sessions/ses_sector7", ""], ["/studio", "demo=1"], ["/showcase", ""], ["/library", ""]]) expect(demoRoute(p, sp(q), true)).toBeNull();
  });
  it("leaves the real-data demo's pages alone", () => {
    expect(demoRoute("/recall", sp("q=x"))).toBeNull();
    expect(demoRoute("/clips", sp())).toBeNull();
    expect(demoRoute("/", sp())).toEqual({ redirect: "/showcase" });
  });
});
