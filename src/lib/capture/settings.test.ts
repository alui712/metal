import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  estimateClipBytes,
  hotkeyFromKey,
  hotkeyProblem,
  hotkeyTokens,
  isAccelerator,
  parseSettings,
  replayLabel,
} from "./settings";

const key = (code: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("parseSettings", () => {
  it("returns defaults for missing or malformed input", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{not json")).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields and replaces only invalid ones", () => {
    const s = parseSettings(
      JSON.stringify({ replaySeconds: 60, quality: "ultra", hotkeys: { saveClip: "Alt+F9", toggleRecording: "S" }, audio: { microphone: false } }),
    );
    expect(s.replaySeconds).toBe(60);
    expect(s.quality).toBe("balanced");
    expect(s.hotkeys.saveClip).toBe("Alt+F9");
    expect(s.hotkeys.toggleRecording).toBe(DEFAULT_SETTINGS.hotkeys.toggleRecording);
    expect(s.audio.microphone).toBe(false);
    expect(s.audio.gameAudio).toBe(true);
  });

  it("rejects replay durations outside the offered options", () => {
    expect(parseSettings(JSON.stringify({ replaySeconds: 45 })).replaySeconds).toBe(30);
  });
});

describe("hotkeys", () => {
  it("builds accelerators in a stable modifier order", () => {
    expect(hotkeyFromKey(key("KeyS", { shiftKey: true, metaKey: true }))).toEqual({ status: "ok", accelerator: "CmdOrCtrl+Shift+S" });
    expect(hotkeyFromKey(key("Digit4", { ctrlKey: true, altKey: true }))).toEqual({ status: "ok", accelerator: "CmdOrCtrl+Alt+4" });
    expect(hotkeyFromKey(key("F9"))).toEqual({ status: "ok", accelerator: "F9" });
  });

  it("waits on modifier-only presses and rejects unsafe keys", () => {
    expect(hotkeyFromKey(key("ShiftLeft", { shiftKey: true }))).toEqual({ status: "pending" });
    expect(hotkeyFromKey(key("KeyS")).status).toBe("invalid");
    expect(hotkeyFromKey(key("Space", { ctrlKey: true })).status).toBe("invalid");
  });

  it("validates stored accelerators", () => {
    expect(isAccelerator("CmdOrCtrl+Shift+S")).toBe(true);
    expect(isAccelerator("F12")).toBe(true);
    expect(isAccelerator("S")).toBe(false);
    expect(isAccelerator("Shift+Shift+S")).toBe(false);
    expect(isAccelerator("Hyper+S")).toBe(false);
  });

  it("reports conflicts and reserved shortcuts", () => {
    const hk = DEFAULT_SETTINGS.hotkeys;
    expect(hotkeyProblem(hk, "saveClip", hk.toggleRecording)).toMatch(/Start \/ stop recording/);
    expect(hotkeyProblem(hk, "saveClip", hk.saveClip)).toBeNull();
    expect(hotkeyProblem(hk, "saveClip", "CmdOrCtrl+Q")).toMatch(/reserved/);
    expect(hotkeyProblem(hk, "saveClip", "Alt+F9")).toBeNull();
  });

  it("renders platform-neutral tokens", () => {
    expect(hotkeyTokens("CmdOrCtrl+Alt+S")).toEqual(["Ctrl/⌘", "Alt/⌥", "S"]);
  });
});

describe("estimates and labels", () => {
  it("estimates clip size from bitrate", () => {
    // 12 Mbps video + 160 kbps audio for 30 s ≈ 45.6 MB
    expect(estimateClipBytes("balanced", 30)).toBe(45_600_000);
  });

  it("labels replay durations", () => {
    expect(replayLabel(30)).toBe("30 s");
    expect(replayLabel(120)).toBe("2 min");
  });
});
