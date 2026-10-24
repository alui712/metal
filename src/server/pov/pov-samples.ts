import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Test fixtures: two "POV" recordings of one synthetic play. Both carry the
// same voice-chat track (seeded tone bursts) at a known offset, each mixed
// with its own game sounds, at different frame rates and lengths.
// Used by tests and to make demo samples; never imported by the app.

export const SAMPLE_RATE = 16000;
const RATE = SAMPLE_RATE;

/** mulberry32: well-mixed even for neighbouring seeds. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

/** Irregular tone bursts ("voices") over `seconds`. */
export function burstTrack(seconds: number, seed: number, opts: { gain?: number; density?: number } = {}): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  const r = rng(seed);
  let t = 0.2;
  while (t < seconds) {
    const dur = 0.12 + r() * 0.5;
    const f = 160 + r() * 700;
    const amp = (opts.gain ?? 0.5) * (0.4 + r() * 0.6);
    const s0 = Math.round(t * RATE);
    const n = Math.round(dur * RATE);
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      const env = Math.min(1, i / 160, (n - i) / 400);
      const x = i / RATE;
      out[s0 + i] += amp * env * (Math.sin(2 * Math.PI * f * x) + 0.4 * Math.sin(4 * Math.PI * f * x));
    }
    t += dur + 0.08 + r() * 1.1 * (opts.density ?? 1);
  }
  return out;
}

export function writeWav(file: string, samples: Float32Array) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, buf);
}

/** Mixes `voice[startS, startS + lenS)` with this player's own game sounds. */
function povAudio(voice: Float32Array, startS: number, lenS: number, seed: number) {
  const game = burstTrack(lenS, seed, { gain: 0.35, density: 0.7 });
  const noise = rng(seed * 7 + 1);
  const s0 = Math.round(startS * RATE);
  for (let i = 0; i < game.length; i++) game[i] += (voice[s0 + i] ?? 0) * 0.8 + (noise() - 0.5) * 0.02;
  return game;
}

export type PovSample = { file: string; startS: number; lenS: number; fps: number };

/**
 * Writes MP4s with a shared voice track. `startS` is where each POV starts
 * within the shared timeline, so B's 0:00 sits at A-time (B.startS − A.startS).
 */
export function makePovSamples(dir: string, specs: Array<{ name: string; startS: number; lenS: number; fps: number; size: string; seed: number; pattern?: string }>, voiceSeed = 42): PovSample[] {
  const total = Math.max(...specs.map((s) => s.startS + s.lenS)) + 1;
  const voice = burstTrack(total, voiceSeed);
  return specs.map((s) => {
    const wav = path.join(dir, `${s.name}.wav`);
    writeWav(wav, povAudio(voice, s.startS, s.lenS, s.seed));
    const file = path.join(dir, `${s.name}.mp4`);
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `${s.pattern ?? "testsrc2"}=size=${s.size}:rate=${s.fps}:duration=${s.lenS}`,
      "-i", wav,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart",
      file,
    ]);
    fs.rmSync(wav);
    return { file, startS: s.startS, lenS: s.lenS, fps: s.fps };
  });
}
