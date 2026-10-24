// Audio signals from FFmpeg's EBU R128 meter. Momentary loudness (M, a
// 400 ms window) is sampled every 100 ms. These are measurements only:
// "louder than the last 15 seconds" — never a claim about what the sound
// was (laughter, gunfire, cheering…).

export type LoudnessSample = { tMs: number; lufs: number };

export type AudioEvent = {
  kind: "loudness_peak" | "loudness_jump" | "silence";
  startMs: number;
  endMs: number;
  score: number;
  evidence: Record<string, number | boolean>;
};

const FLOOR = -70;
const WINDOW_MS = 400;
const BASELINE_MS = 15_000;
const PEAK_OVER_BASELINE = 9; // LU
const PEAK_MIN_LUFS = -40;
const JUMP_RISE = 12; // LU within 1 s
const JUMP_MIN_LUFS = -45;
const SILENCE_LUFS = -60;
const SILENCE_MIN_MS = 3000;

/** Parses `ebur128` log lines ("t: 5.4999  … M: -8.1 S: …") into samples, shifted to source time. */
export function parseEbur128(stderr: string, offsetMs = 0): LoudnessSample[] {
  const out: LoudnessSample[] = [];
  for (const m of stderr.matchAll(/\bt:\s*([\d.]+)\s+TARGET:[^M]*M:\s*(-?[\d.]+|-inf|nan)/g)) {
    const t = Number(m[1]);
    const v = Number(m[2]);
    if (!Number.isFinite(t)) continue;
    out.push({ tMs: Math.round(t * 1000) + offsetMs, lufs: Number.isFinite(v) ? Math.max(FLOOR, v) : FLOOR });
  }
  return out;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

function median(values: number[]): number {
  if (!values.length) return FLOOR;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Pure: loudness samples → peaks, sudden jumps, and long silences. */
export function detectAudioEvents(samples: LoudnessSample[], durationMs: number): AudioEvent[] {
  if (samples.length < 5) return [];
  const step = samples.length > 1 ? samples[1].tMs - samples[0].tMs || 100 : 100;
  const span = Math.max(1, Math.round(BASELINE_MS / step));
  const early = median(samples.slice(0, span).map((s) => s.lufs));
  // Baseline for sample i: median loudness of the 15 s before it (the first 15 s for the opening).
  const baseline = samples.map((_, i) => (i < span ? early : median(samples.slice(i - span, i).map((s) => s.lufs))));
  const events: AudioEvent[] = [];

  // Peaks: runs clearly above the recent baseline.
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const first = run[0];
    const last = run[run.length - 1];
    let peak = first;
    for (const i of run) if (samples[i].lufs > samples[peak].lufs) peak = i;
    const base = baseline[first];
    const delta = samples[peak].lufs - base;
    const lookback = Math.max(0, first - 10);
    let low = samples[first].lufs;
    for (let j = lookback; j <= first; j++) low = Math.min(low, samples[j].lufs);
    const rise = samples[peak].lufs - low;
    const lengthMs = samples[last].tMs - samples[first].tMs + step;
    if (lengthMs >= 300) {
      events.push({
        kind: "loudness_peak",
        startMs: Math.max(0, samples[first].tMs - WINDOW_MS),
        endMs: Math.min(durationMs, samples[last].tMs),
        score: round1(clamp01(0.7 * clamp01((delta - PEAK_OVER_BASELINE) / 15) + 0.3 * clamp01((samples[peak].lufs + 40) / 30)) * 100) / 100,
        evidence: {
          peakMs: samples[peak].tMs - WINDOW_MS / 2,
          peakLufs: round1(samples[peak].lufs),
          baselineLufs: round1(base),
          overBaselineLu: round1(delta),
          suddenOnset: rise >= JUMP_RISE,
          riseLu: round1(rise),
        },
      });
    }
    run = [];
  };
  for (let i = 0; i < samples.length; i++) {
    const loud = samples[i].lufs >= PEAK_MIN_LUFS && samples[i].lufs - baseline[i] >= PEAK_OVER_BASELINE;
    // Allow ≤ 1 s dips inside one peak.
    if (loud) {
      if (run.length && samples[i].tMs - samples[run[run.length - 1]].tMs > 1000) flush();
      run.push(i);
    }
  }
  flush();

  // Sudden jumps that aren't already part of a peak.
  const inPeak = (t: number) => events.some((e) => e.kind === "loudness_peak" && t >= e.startMs - 500 && t <= e.endMs + 500);
  // The meter needs its 400 ms window to fill, and audio starting at 0:00 isn't an event: skip the first second.
  const warmEnd = samples[0].tMs + 1000;
  for (let i = 10; i < samples.length; i++) {
    if (samples[i].tMs < warmEnd + 400) continue;
    let low = Infinity;
    for (let j = i - 10; j < i; j++) if (samples[j].tMs >= warmEnd) low = Math.min(low, samples[j].lufs);
    if (low === Infinity) continue;
    const rise = samples[i].lufs - low;
    if (rise >= JUMP_RISE && samples[i].lufs >= JUMP_MIN_LUFS && !inPeak(samples[i].tMs)) {
      const last = events[events.length - 1];
      if (last?.kind === "loudness_jump" && samples[i].tMs - last.endMs < 1500) continue;
      events.push({
        kind: "loudness_jump",
        startMs: Math.max(0, samples[i].tMs - 1000),
        endMs: Math.min(durationMs, samples[i].tMs + 500),
        score: round1(clamp01((rise - JUMP_RISE) / 15) * 0.6 * 100) / 100,
        evidence: { atMs: samples[i].tMs - WINDOW_MS / 2, lufs: round1(samples[i].lufs), riseLu: round1(rise) },
      });
    }
  }

  // Long silences (useful to keep clips away from dead air).
  let quietStart: number | null = null;
  for (let i = 0; i <= samples.length; i++) {
    const quiet = i < samples.length && samples[i].lufs < SILENCE_LUFS;
    if (quiet && quietStart === null) quietStart = i;
    if (!quiet && quietStart !== null) {
      const s = Math.max(0, samples[quietStart].tMs - WINDOW_MS);
      const e = Math.min(durationMs, samples[i - 1].tMs);
      if (e - s >= SILENCE_MIN_MS) events.push({ kind: "silence", startMs: s, endMs: e, score: 1, evidence: { belowLufs: SILENCE_LUFS } });
      quietStart = null;
    }
  }
  return events.sort((a, b) => a.startMs - b.startMs);
}
