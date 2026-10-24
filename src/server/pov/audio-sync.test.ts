import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { alignEnvelopes, classifyAlignment, decodeEnvelope, onsetEnvelope } from "./audio-sync";
import { burstTrack, makePovSamples, SAMPLE_RATE } from "./pov-samples";

describe("alignEnvelopes", () => {
  const shared = burstTrack(120, 7);
  const own = (seed: number, s: number, len: number) => {
    const x = burstTrack(len, seed, { gain: 0.3, density: 0.7 });
    const s0 = Math.round(s * SAMPLE_RATE);
    for (let i = 0; i < x.length; i++) x[i] += shared[s0 + i] * 0.8;
    return onsetEnvelope(x, SAMPLE_RATE);
  };

  it("finds a positive offset between overlapping POVs", () => {
    // B starts 23.47 s after A.
    const al = alignEnvelopes(own(1, 10, 60), own(2, 33.47, 50));
    expect(classifyAlignment(al)).toBe("reliable");
    expect(Math.abs(al!.offsetMs - 23470)).toBeLessThanOrEqual(15);
  });

  it("finds a negative offset (B started first) and respects the lag window", () => {
    const a = own(3, 40, 40);
    const b = own(4, 25, 70);
    const al = alignEnvelopes(a, b);
    expect(Math.abs(al!.offsetMs - -15000)).toBeLessThanOrEqual(15);
    // A window that excludes the true lag can't claim it.
    expect(classifyAlignment(alignEnvelopes(a, b, { minLagMs: 0, maxLagMs: 60_000 }))).not.toBe("reliable");
  });

  it("doesn't call unrelated audio a match", () => {
    const a = onsetEnvelope(burstTrack(60, 11), SAMPLE_RATE);
    const b = onsetEnvelope(burstTrack(60, 12), SAMPLE_RATE);
    expect(classifyAlignment(alignEnvelopes(a, b))).not.toBe("reliable");
  });

  it("is stable across many plays: reliable means exact, unrelated is never reliable", () => {
    let falseReliable = 0;
    for (let k = 0; k < 12; k++) {
      const voice = burstTrack(90, 500 + k);
      const pov = (seed: number, start: number, len: number) => {
        const x = burstTrack(len, seed, { gain: 0.35, density: 0.7 });
        const s0 = Math.round(start * SAMPLE_RATE);
        for (let i = 0; i < x.length; i++) x[i] += voice[s0 + i] * 0.8;
        return onsetEnvelope(x, SAMPLE_RATE);
      };
      const a = pov(1000 + k, 3, 45);
      // ≥ 25 s of shared audio: must be found, and exactly.
      const startB = 5 + k * 1.57;
      const al = alignEnvelopes(a, pov(2000 + k, startB, 40));
      expect(classifyAlignment(al), `play ${k}`).toBe("reliable");
      expect(Math.abs(al!.offsetMs - Math.round((startB - 3) * 1000)), `play ${k}`).toBeLessThanOrEqual(15);
      // Short overlap (12 s): may be unsure, but never confidently wrong.
      const short = alignEnvelopes(a, pov(4000 + k, 36, 30));
      if (classifyAlignment(short) === "reliable") expect(Math.abs(short!.offsetMs - 33000), `short ${k}`).toBeLessThanOrEqual(15);
      const un = alignEnvelopes(a, onsetEnvelope(burstTrack(40, 3000 + k, { gain: 0.6 }), SAMPLE_RATE));
      if (classifyAlignment(un) === "reliable") falseReliable++;
    }
    expect(falseReliable).toBe(0);
  }, 60_000);

  it("rejects the peaks unrelated real footage produced (regression)", () => {
    // Measured on this app's own test recordings: tone-heavy, unrelated, but with one standout peak.
    const base = { offsetMs: 24_987, overlapMs: 20_010 };
    expect(classifyAlignment({ ...base, score: 0.211, distinct: 1.92, prominence: 9.8 })).toBe("weak");
    expect(classifyAlignment({ ...base, score: 0.228, distinct: 1.21, prominence: 11.0 })).toBe("none");
    expect(classifyAlignment({ ...base, score: 0.318, distinct: 3.85, prominence: 16.7 })).toBe("reliable");
  });

  it("needs enough overlap", () => {
    const al = alignEnvelopes(own(5, 0, 5), own(6, 0, 5));
    expect(al).toBeNull();
    expect(classifyAlignment(null)).toBe("none");
  });
});

describe("real recordings (FFmpeg)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "metal-pov-"));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("aligns two POV files with different frame rates and lengths, and rejects an unrelated one", async () => {
    const [a, b] = makePovSamples(dir, [
      { name: "a", startS: 4, lenS: 40, fps: 30, size: "640x360", seed: 101 },
      { name: "b", startS: 16.25, lenS: 34, fps: 60, size: "854x480", seed: 202 },
    ]);
    const [x] = makePovSamples(dir, [{ name: "x", startS: 0, lenS: 40, fps: 30, size: "640x360", seed: 303 }], 999);
    const ea = (await decodeEnvelope(a.file))!;
    const eb = (await decodeEnvelope(b.file))!;
    const al = alignEnvelopes(ea, eb);
    const ax = alignEnvelopes(ea, (await decodeEnvelope(x.file))!);
    expect(classifyAlignment(al)).toBe("reliable");
    // AAC encoder priming can shift each file by a few ms.
    expect(Math.abs(al!.offsetMs - 12250)).toBeLessThanOrEqual(30);
    expect(classifyAlignment(ax)).not.toBe("reliable");
  }, 60_000);

  it("reports a file without audio as null", async () => {
    const f = path.join(dir, "silent.mp4");
    const { execFileSync } = await import("node:child_process");
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30:duration=3", "-c:v", "libx264", "-preset", "ultrafast", f]);
    expect(await decodeEnvelope(f)).toBeNull();
  }, 30_000);
});
