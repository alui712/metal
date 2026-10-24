import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { config } from "../config";

// Which analysis providers are actually usable right now. Anything not set
// up is reported as unavailable — never simulated.

export type ProviderStatus = { available: true; name: string } | { available: false; reason: string };

let whisperCache: { at: number; ok: boolean } | null = null;

export function speechProvider(): ProviderStatus {
  if (!whisperCache || Date.now() - whisperCache.at > 30_000) {
    let ok = false;
    try {
      execFileSync(config.whisperPath, ["--help"], { stdio: "ignore", timeout: 5000 });
      ok = true;
    } catch {
      ok = false;
    }
    whisperCache = { at: Date.now(), ok };
  }
  if (!whisperCache.ok) return { available: false, reason: "Speech transcription isn’t set up (whisper.cpp isn’t installed)." };
  if (!fs.existsSync(config.whisperModelPath)) return { available: false, reason: "Speech transcription isn’t set up (no Whisper model downloaded)." };
  return { available: true, name: "whisper.cpp" };
}

export function visionProvider(): ProviderStatus {
  if (!config.anthropicApiKey) return { available: false, reason: "Scene descriptions aren’t set up (no AI provider key configured)." };
  // A key alone doesn't enable it: sending frames out needs the analysis step and user consent, which aren't built yet.
  return { available: false, reason: "Scene descriptions aren’t enabled in this version yet." };
}
