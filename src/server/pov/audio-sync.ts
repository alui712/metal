import { spawn } from "node:child_process";
import { config } from "../config";

// Shared-audio alignment between two recordings of the same play (ADR 0019).
// Each file's audio becomes a spectral-flux envelope (how much new sound
// starts, per frequency, every 10 ms); the offset is where the two envelopes
// correlate best. Two POVs share voice chat and many game sounds, so their
// onsets line up; unrelated recordings produce no distinct peak, and we say so.

export const HOP_MS = 10;
const RATE = 8000;
/** Audio decoded per recording (from 0:00). Longer recordings are matched on their first hour. */
export const MAX_DECODE_MS = 60 * 60_000;

/** Alignment is "reliable" only with a clear, distinct peak over enough shared audio. */
// Calibrated on real recordings, not only synthetic ones: unrelated tone-heavy
// test footage reached distinct 1.92 / prominence 11, a true pair 3.85 / 16.7.
export const SYNC_RULES = { minOverlapMs: 8000, reliableScore: 0.15, reliableDistinct: 2.2, reliableProminence: 12, weakDistinct: 1.5, weakProminence: 8 } as const;

/** Streaming spectral flux: 32 ms Hann frames every 10 ms, summed rise in log magnitude. */
class Flux {
  readonly out: number[] = [];
  private readonly hop: number;
  private readonly n: number;
  private readonly win: Float64Array;
  private readonly ring: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private prev: Float64Array | null = null;
  private pos = 0;
  private since = 0;

  constructor(rate: number) {
    this.hop = Math.round((rate * HOP_MS) / 1000);
    let n = 1;
    while (n < rate * 0.032) n <<= 1;
    this.n = n;
    this.win = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    this.ring = new Float64Array(n);
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
  }

  push(x: number) {
    this.ring[this.pos] = x;
    this.pos = (this.pos + 1) % this.n;
    if (++this.since === this.hop) {
      this.since = 0;
      this.frame();
    }
  }

  private frame() {
    const { n, re, im } = this;
    for (let i = 0; i < n; i++) {
      re[i] = this.ring[(this.pos + i) % n] * this.win[i];
      im[i] = 0;
    }
    fft(re, im, false);
    const mag = new Float64Array(n / 2);
    let flux = 0;
    for (let k = 1; k < n / 2; k++) {
      mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      if (this.prev) flux += Math.max(0, mag[k] - this.prev[k]);
    }
    this.prev = mag;
    this.out.push(flux);
  }
}

/** Spectral-flux envelope from mono samples (−1…1). */
export function onsetEnvelope(samples: Float32Array, rate = RATE): Float32Array {
  const f = new Flux(rate);
  for (let i = 0; i < samples.length; i++) f.push(samples[i]);
  return Float32Array.from(f.out);
}

/** Decodes a file's first audio stream (mono 8 kHz) straight into a flux envelope. Null when it has no audio. */
export function decodeEnvelope(file: string, opts: { signal?: AbortSignal; maxMs?: number } = {}): Promise<Float32Array | null> {
  const maxMs = opts.maxMs ?? MAX_DECODE_MS;
  return new Promise((resolve, reject) => {
    const args = ["-hide_banner", "-nostdin", "-loglevel", "error", "-i", file, "-map", "0:a:0", "-t", (maxMs / 1000).toFixed(3), "-ac", "1", "-ar", String(RATE), "-f", "s16le", "pipe:1"];
    const child = spawn(config.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"], signal: opts.signal });
    const f = new Flux(RATE);
    let odd: number | null = null;
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      let i = 0;
      if (odd !== null) {
        f.push(Buffer.from([odd, chunk[0]]).readInt16LE(0) / 32768);
        odd = null;
        i = 1;
      }
      for (; i + 1 < chunk.length; i += 2) f.push(chunk.readInt16LE(i) / 32768);
      if (i < chunk.length) odd = chunk[i];
    });
    child.stderr.setEncoding("utf8").on("data", (d: string) => {
      stderr = (stderr + d).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(f.out.length ? Float32Array.from(f.out) : null);
      // "matches no streams": the file has no audio track.
      else if (/matches no streams|does not contain any stream/i.test(stderr)) resolve(null);
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim().split("\n").pop() ?? ""}`));
    });
  });
}

// ── FFT cross-correlation ────────────────────────────────────

function fft(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
}

/** c[L] = Σ a[j+L]·b[j] for every lag L (index L, or n+L when negative). */
function crossCorrelate(a: Float32Array, b: Float32Array): { c: Float64Array; n: number } {
  let n = 1;
  while (n < a.length + b.length) n <<= 1;
  const ar = new Float64Array(n);
  const ai = new Float64Array(n);
  const br = new Float64Array(n);
  const bi = new Float64Array(n);
  ar.set(a);
  br.set(b);
  fft(ar, ai, false);
  fft(br, bi, false);
  for (let i = 0; i < n; i++) {
    // A · conj(B)
    const r = ar[i] * br[i] + ai[i] * bi[i];
    const im = ai[i] * br[i] - ar[i] * bi[i];
    ar[i] = r;
    ai[i] = im;
  }
  fft(ar, ai, true);
  return { c: ar, n };
}

const prefix = (x: Float32Array, sq: boolean) => {
  const p = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) p[i + 1] = p[i] + (sq ? x[i] * x[i] : x[i]);
  return p;
};

export type Alignment = {
  /** Where b's 0:00 falls on a's timeline (ms): an event at b-time t happens at a-time t + offsetMs. */
  offsetMs: number;
  /** Pearson correlation of the overlapping envelopes at that offset (−1…1). */
  score: number;
  /** Significance of the best lag ÷ the best significance at least 0.5 s away from it. */
  distinct: number;
  /** How far the best lag stands out from all lags: (best − median) ÷ robust spread (MAD). */
  prominence: number;
  overlapMs: number;
};

/**
 * Best alignment of envelope b against envelope a, searched over lags in
 * [minLagMs, maxLagMs] with Pearson correlation computed only over the
 * overlap (so partial overlaps at the edges aren't favored). Null when no lag
 * leaves at least `minOverlapMs` of shared audio.
 */
export function alignEnvelopes(a: Float32Array, b: Float32Array, opts: { minLagMs?: number; maxLagMs?: number; minOverlapMs?: number } = {}): Alignment | null {
  const minOverlap = Math.ceil((opts.minOverlapMs ?? SYNC_RULES.minOverlapMs) / HOP_MS);
  const lo = Math.max(-(b.length - minOverlap), Math.floor((opts.minLagMs ?? -Infinity) / HOP_MS));
  const hi = Math.min(a.length - minOverlap, Math.ceil((opts.maxLagMs ?? Infinity) / HOP_MS));
  if (lo > hi) return null;
  const { c, n } = crossCorrelate(a, b);
  const pa = prefix(a, false);
  const pa2 = prefix(a, true);
  const pb = prefix(b, false);
  const pb2 = prefix(b, true);
  const r = new Float64Array(hi - lo + 1);
  const z = new Float64Array(hi - lo + 1);
  for (let L = lo; L <= hi; L++) {
    // Overlap: b[j] with a[j+L] for j in [j0, j1).
    const j0 = Math.max(0, -L);
    const j1 = Math.min(b.length, a.length - L);
    const m = j1 - j0;
    if (m < minOverlap) continue;
    const sa = pa[j1 + L] - pa[j0 + L];
    const saa = pa2[j1 + L] - pa2[j0 + L];
    const sb = pb[j1] - pb[j0];
    const sbb = pb2[j1] - pb2[j0];
    const sab = c[L >= 0 ? L : n + L];
    const va = saa - (sa * sa) / m;
    const vb = sbb - (sb * sb) / m;
    r[L - lo] = va > 1e-9 && vb > 1e-9 ? (sab - (sa * sb) / m) / Math.sqrt(va * vb) : 0;
    // Rank by significance, not raw correlation: a short overlap correlates well by chance.
    z[L - lo] = r[L - lo] * Math.sqrt(m / 100);
  }
  let best = 0;
  for (let i = 1; i < z.length; i++) if (z[i] > z[best]) best = i;
  const away = Math.round(500 / HOP_MS);
  let second = 0;
  for (let i = 0; i < z.length; i++) if (Math.abs(i - best) > away && z[i] > second) second = z[i];
  // Sub-hop refinement (parabola through the peak and its neighbours).
  let frac = 0;
  if (best > 0 && best < r.length - 1) {
    const y0 = r[best - 1];
    const y1 = r[best];
    const y2 = r[best + 1];
    const d = y0 - 2 * y1 + y2;
    if (d < 0) frac = Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d));
  }
  // Robust outlier score of the peak against every evaluated lag.
  const zs = Array.from(z).filter((_, i) => r[i] !== 0).sort((x, y) => x - y);
  const med = zs[Math.floor(zs.length / 2)] ?? 0;
  const mad = (zs.map((x) => Math.abs(x - med)).sort((x, y) => x - y)[Math.floor(zs.length / 2)] ?? 0) * 1.4826;
  const prominence = mad > 1e-9 ? (z[best] - med) / mad : 0;
  const L = best + lo;
  const overlap = Math.min(b.length, a.length - L) - Math.max(0, -L);
  return {
    offsetMs: Math.round((L + frac) * HOP_MS),
    score: r[best],
    distinct: second > 0 ? z[best] / second : z[best] > 0 ? 99 : 0,
    overlapMs: overlap * HOP_MS,
    prominence,
  };
}

/** How much to trust an alignment. Only "reliable" is ever presented as audio evidence of a match. */
export function classifyAlignment(al: Alignment | null): "reliable" | "weak" | "none" {
  if (!al || al.overlapMs < SYNC_RULES.minOverlapMs) return "none";
  if (al.score >= SYNC_RULES.reliableScore && al.distinct >= SYNC_RULES.reliableDistinct && al.prominence >= SYNC_RULES.reliableProminence) return "reliable";
  return al.distinct >= SYNC_RULES.weakDistinct && al.prominence >= SYNC_RULES.weakProminence ? "weak" : "none";
}
