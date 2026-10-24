import { z } from "zod";

// Capture preferences. Phase 1b only stores them on this device; the OBS
// adapter (Phase 4) applies them. Pure module: shared by UI and tests.

export const REPLAY_OPTIONS = [15, 30, 60, 120, 300] as const;
export type ReplaySeconds = (typeof REPLAY_OPTIONS)[number];

export const QUALITY_PRESETS = {
  performance: { label: "Performance", resolution: "1280×720", height: 720, fps: 60, videoMbps: 6, hint: "Lightest on your GPU and disk." },
  balanced: { label: "Balanced", resolution: "1920×1080", height: 1080, fps: 60, videoMbps: 12, hint: "Sharp 1080p for most games." },
  quality: { label: "High quality", resolution: "2560×1440", height: 1440, fps: 60, videoMbps: 24, hint: "For fast motion and big screens." },
} as const;
export type QualityPreset = keyof typeof QUALITY_PRESETS;

const AUDIO_KBPS = 160;

export const HOTKEY_ACTIONS = {
  saveClip: { label: "Save clip", hint: "Saves the replay buffer as a clip." },
  toggleRecording: { label: "Start / stop recording", hint: "Toggles a full-session recording." },
  markMoment: { label: "Mark moment for Smart Clip", hint: "Flags the last few seconds for AI Smart Clip to look at first." },
} as const;
export type HotkeyAction = keyof typeof HOTKEY_ACTIONS;

const qualitySchema = z.enum(["performance", "balanced", "quality"]);

export const DEFAULT_SETTINGS = {
  replaySeconds: 30 as ReplaySeconds,
  quality: "balanced" as QualityPreset,
  container: "mkv" as "mkv" | "mp4",
  hotkeys: {
    saveClip: "CmdOrCtrl+Shift+S",
    toggleRecording: "CmdOrCtrl+Shift+R",
    markMoment: "CmdOrCtrl+Shift+M",
  } satisfies Record<HotkeyAction, string>,
  audio: {
    gameAudio: true,
    microphone: true,
    separateMicTrack: true,
    voiceChatTrack: false,
  },
};
export type CaptureSettings = typeof DEFAULT_SETTINGS;
export type AudioOption = keyof CaptureSettings["audio"];

const D = DEFAULT_SETTINGS;
// Each field falls back on its own, so one bad value never resets everything.
const schema = z.object({
  replaySeconds: z
    .number()
    .refine((n): n is ReplaySeconds => (REPLAY_OPTIONS as readonly number[]).includes(n))
    .catch(D.replaySeconds),
  quality: qualitySchema.catch(D.quality),
  container: z.enum(["mkv", "mp4"]).catch(D.container),
  hotkeys: z
    .object({
      saveClip: z.string().refine(isAccelerator).catch(D.hotkeys.saveClip),
      toggleRecording: z.string().refine(isAccelerator).catch(D.hotkeys.toggleRecording),
      markMoment: z.string().refine(isAccelerator).catch(D.hotkeys.markMoment),
    })
    .catch(D.hotkeys),
  audio: z
    .object({
      gameAudio: z.boolean().catch(D.audio.gameAudio),
      microphone: z.boolean().catch(D.audio.microphone),
      separateMicTrack: z.boolean().catch(D.audio.separateMicTrack),
      voiceChatTrack: z.boolean().catch(D.audio.voiceChatTrack),
    })
    .catch(D.audio),
});

/** Parses stored JSON; anything missing or invalid falls back to the default. */
export function parseSettings(raw: string | null | undefined): CaptureSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return schema.parse(JSON.parse(raw)) as CaptureSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Estimated size of one saved clip, in bytes (constant-bitrate approximation). */
export function estimateClipBytes(quality: QualityPreset, seconds: number): number {
  const kbps = QUALITY_PRESETS[quality].videoMbps * 1000 + AUDIO_KBPS;
  return Math.round((kbps * 1000 * seconds) / 8);
}

export function replayLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`;
}

// ── Hotkeys ──────────────────────────────────────────────
// Stored as Electron-style accelerators (e.g. "CmdOrCtrl+Shift+S") so the
// desktop shell can register them unchanged.

const MODIFIERS = ["CmdOrCtrl", "Alt", "Shift"] as const;
const KEY_RE = /^([A-Z]|[0-9]|F([1-9]|1[0-9]|2[0-4]))$/;
const FN_RE = /^F([1-9]|1[0-9]|2[0-4])$/;

export function isAccelerator(value: string): boolean {
  const parts = value.split("+");
  const key = parts.pop() ?? "";
  if (!KEY_RE.test(key)) return false;
  if (new Set(parts).size !== parts.length) return false;
  if (!parts.every((p) => (MODIFIERS as readonly string[]).includes(p))) return false;
  return parts.length > 0 || FN_RE.test(key);
}

export type KeyInput = { code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean };

export type HotkeyCapture =
  | { status: "pending" }
  | { status: "ok"; accelerator: string }
  | { status: "invalid"; reason: string };

/** Turns a keydown into an accelerator. Modifier-only presses stay pending. */
export function hotkeyFromKey(e: KeyInput): HotkeyCapture {
  const code = e.code;
  if (/^(Meta|Control|Alt|Shift)(Left|Right)?$/.test(code)) return { status: "pending" };
  const key = code.startsWith("Key") ? code.slice(3) : code.startsWith("Digit") ? code.slice(5) : code;
  if (!KEY_RE.test(key)) return { status: "invalid", reason: "Use a letter, number, or F-key." };
  const mods = [e.metaKey || e.ctrlKey ? "CmdOrCtrl" : null, e.altKey ? "Alt" : null, e.shiftKey ? "Shift" : null].filter(
    (m): m is string => m !== null,
  );
  if (mods.length === 0 && !FN_RE.test(key)) {
    return { status: "invalid", reason: "Add Ctrl/⌘, Alt, or Shift so it won’t fire while you type in-game." };
  }
  return { status: "ok", accelerator: [...mods, key].join("+") };
}

/** Combos the OS or apps already own; binding them would break common shortcuts. */
const RESERVED = new Set(["CmdOrCtrl+Q", "CmdOrCtrl+W", "CmdOrCtrl+C", "CmdOrCtrl+V", "CmdOrCtrl+X", "CmdOrCtrl+Z", "CmdOrCtrl+A", "CmdOrCtrl+Tab", "Alt+F4"]);

/** Why `accelerator` can't be used for `action`, or null when it can. */
export function hotkeyProblem(
  hotkeys: Record<HotkeyAction, string>,
  action: HotkeyAction,
  accelerator: string,
): string | null {
  if (RESERVED.has(accelerator)) return "That shortcut is reserved by the system.";
  const clash = (Object.keys(hotkeys) as HotkeyAction[]).find((a) => a !== action && hotkeys[a] === accelerator);
  return clash ? `Already used for “${HOTKEY_ACTIONS[clash].label}”.` : null;
}

/** Display tokens, platform-neutral so server and client render the same. */
export function hotkeyTokens(accelerator: string): string[] {
  return accelerator.split("+").map((p) => (p === "CmdOrCtrl" ? "Ctrl/⌘" : p === "Alt" ? "Alt/⌥" : p));
}
