import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { config } from "../config";

// Which analysis providers are actually usable right now. Anything not set
// up is reported as unavailable — never simulated.

export type ProviderStatus = { available: true; name: string } | { available: false; reason: string };

let whisperCache: { at: number; ok: boolean; bin: string } | null = null;

/** GGML model files start with the magic "lmgg" (0x67676d6c, little-endian). */
export function isGgmlModel(file: string, minBytes = 1024 * 1024): boolean {
  try {
    const fd = fs.openSync(/*turbopackIgnore: true*/ file, "r");
    const head = Buffer.alloc(4);
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    return head.toString("latin1") === "lmgg" && fs.statSync(/*turbopackIgnore: true*/ file).size > minBytes;
  } catch {
    return false;
  }
}

export function speechProvider(): ProviderStatus {
  if (!whisperCache || whisperCache.bin !== config.whisperPath || Date.now() - whisperCache.at > 30_000) {
    let ok = false;
    try {
      execFileSync(config.whisperPath, ["--help"], { stdio: "ignore", timeout: 5000 });
      ok = true;
    } catch {
      ok = false;
    }
    whisperCache = { at: Date.now(), ok, bin: config.whisperPath };
  }
  if (!whisperCache.ok) return { available: false, reason: "Speech transcription isn’t set up (whisper.cpp isn’t installed)." };
  const model = config.whisperModelPath;
  if (!fs.existsSync(/*turbopackIgnore: true*/ model)) return { available: false, reason: "Speech transcription isn’t set up (no Whisper model found — put ggml-base.en.bin in models/)." };
  if (!isGgmlModel(model)) return { available: false, reason: "The Whisper model file isn’t a valid GGML model. Download it again." };
  return { available: true, name: "whisper.cpp" };
}

export function visionProvider(): ProviderStatus {
  if (!config.anthropicApiKey) return { available: false, reason: "Scene descriptions aren’t set up (no AI provider key configured)." };
  // A key alone doesn't enable it: sending frames out needs the analysis step and user consent, which aren't built yet.
  return { available: false, reason: "Scene descriptions aren’t enabled in this version yet." };
}

let vadCache: { at: number; ok: boolean; bin: string } | null = null;

/** Silero voice-activity detection via whisper.cpp's whisper-vad-speech-segments. */
export function vadProvider(): ProviderStatus {
  if (!vadCache || vadCache.bin !== config.whisperVadPath || Date.now() - vadCache.at > 30_000) {
    let ok = false;
    try {
      execFileSync(config.whisperVadPath, ["--help"], { stdio: "ignore", timeout: 5000 });
      ok = true;
    } catch {
      ok = false;
    }
    vadCache = { at: Date.now(), ok, bin: config.whisperVadPath };
  }
  if (!vadCache.ok) return { available: false, reason: "whisper-vad-speech-segments isn’t installed." };
  if (!isGgmlModel(config.whisperVadModelPath, 100 * 1024)) return { available: false, reason: "No Silero VAD model in models/." };
  return { available: true, name: "Silero VAD" };
}
