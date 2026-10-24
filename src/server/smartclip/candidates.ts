// Smart Clip candidates from measured signals, by transparent rules. Every
// suggestion carries the signals behind it and the points each rule added.
// Titles describe the measurement ("Loud moment"), never a game event.

export type Signal =
  | { kind: "loudness_peak"; startMs: number; endMs: number; score: number; evidence: { peakMs?: number; overBaselineLu?: number; peakLufs?: number; suddenOnset?: boolean; riseLu?: number } }
  | { kind: "loudness_jump"; startMs: number; endMs: number; score: number; evidence: { atMs?: number; riseLu?: number; lufs?: number } }
  | { kind: "scene_change"; startMs: number; endMs: number; score: number; evidence: { scdetScore?: number } }
  | { kind: "silence"; startMs: number; endMs: number; score: number; evidence: Record<string, unknown> };

export type Evidence = { kind: "loudness_peak" | "loudness_jump" | "scene_change" | "visual_burst"; startMs: number; endMs: number; label: string; detail: string };
export type Candidate = {
  eventStartMs: number;
  eventEndMs: number;
  startMs: number;
  endMs: number;
  /** Where the strongest signal is (for thumbnails). */
  focusMs: number;
  score: number;
  confidence: "strong" | "moderate" | "weak";
  title: string;
  evidence: Evidence[];
  breakdown: Array<{ rule: string; points: number }>;
};

export const RULES = {
  preRollMs: 6000,
  postRollMs: 4000,
  minClipMs: 10_000,
  maxClipMs: 45_000,
  groupGapMs: 3000,
  minScore: 0.25,
  maxSuggestions: 12,
  burstMinChanges: 3,
  burstWindowMs: 4000,
  /** A "clip" covering most of the recording isn't a clip: the recording already is one. */
  maxCoverage: 0.85,
};

const r2 = (n: number) => Math.round(n * 100) / 100;
export const clockLabel = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

type Anchor = { kind: Evidence["kind"]; startMs: number; endMs: number; focusMs: number; score: number; evidence: Evidence; onset: boolean };

function anchors(signals: Signal[]): Anchor[] {
  const out: Anchor[] = [];
  for (const s of signals) {
    if (s.kind === "loudness_peak") {
      const e = s.evidence;
      out.push({
        kind: s.kind,
        startMs: s.startMs,
        endMs: s.endMs,
        focusMs: e.peakMs ?? s.startMs,
        score: s.score,
        onset: Boolean(e.suddenOnset),
        evidence: {
          kind: s.kind,
          startMs: s.startMs,
          endMs: s.endMs,
          label: "Loud audio",
          detail: `${e.overBaselineLu ?? "?"} LU louder than the previous 15 s${e.peakLufs !== undefined ? ` (peak ${e.peakLufs} LUFS)` : ""}${e.suddenOnset ? `, sudden onset (+${e.riseLu} LU)` : ""}`,
        },
      });
    } else if (s.kind === "loudness_jump") {
      out.push({
        kind: s.kind,
        startMs: s.startMs,
        endMs: s.endMs,
        focusMs: s.evidence.atMs ?? s.startMs,
        score: s.score,
        onset: true,
        evidence: { kind: s.kind, startMs: s.startMs, endMs: s.endMs, label: "Sudden loud sound", detail: `Loudness rose ${s.evidence.riseLu ?? "?"} LU within a second` },
      });
    }
  }
  // Bursts of scene changes: the picture changed a lot, repeatedly.
  const scenes = signals.filter((s) => s.kind === "scene_change").sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < scenes.length; ) {
    let j = i;
    while (j + 1 < scenes.length && scenes[j + 1].startMs - scenes[i].startMs <= RULES.burstWindowMs) j++;
    const n = j - i + 1;
    if (n >= RULES.burstMinChanges) {
      const start = scenes[i].startMs;
      const end = scenes[j].startMs;
      out.push({
        kind: "visual_burst",
        startMs: start,
        endMs: end,
        focusMs: start,
        score: Math.min(0.4, 0.25 + 0.05 * (n - RULES.burstMinChanges)),
        onset: false,
        evidence: { kind: "visual_burst", startMs: start, endMs: end, label: "Rapid on-screen changes", detail: `${n} large picture changes in ${((end - start) / 1000).toFixed(1)} s` },
      });
      i = j + 1;
    } else i++;
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Clip boundaries around an event: pre/post-roll, min/max length, clamped to the video. */
export function clipBounds(eventStartMs: number, eventEndMs: number, durationMs: number): { startMs: number; endMs: number } {
  if (durationMs <= RULES.minClipMs) return { startMs: 0, endMs: durationMs };
  let start = eventStartMs - RULES.preRollMs;
  let end = Math.min(eventEndMs + RULES.postRollMs, start + RULES.maxClipMs);
  if (end - start < RULES.minClipMs) {
    const pad = (RULES.minClipMs - (end - start)) / 2;
    start -= pad;
    end += pad;
  }
  if (start < 0) {
    end = Math.min(durationMs, end - start);
    start = 0;
  }
  if (end > durationMs) {
    start = Math.max(0, start - (end - durationMs));
    end = durationMs;
  }
  return { startMs: Math.round(start), endMs: Math.round(end) };
}

const overlap = (a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }) => Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);

/** Pure: signals → ranked, non-overlapping clip suggestions. */
export function buildCandidates(signals: Signal[], durationMs: number): Candidate[] {
  const list = anchors(signals);
  const scenes = signals.filter((s) => s.kind === "scene_change");
  // Group nearby anchors into event windows.
  const groups: Anchor[][] = [];
  for (const a of list) {
    const g = groups[groups.length - 1];
    if (g && a.startMs - Math.max(...g.map((x) => x.endMs)) <= RULES.groupGapMs) g.push(a);
    else groups.push([a]);
  }

  const raw: Candidate[] = [];
  for (const g of groups) {
    const eventStartMs = Math.min(...g.map((a) => a.startMs));
    const eventEndMs = Math.max(...g.map((a) => a.endMs));
    const audio = g.filter((a) => a.kind !== "visual_burst");
    const breakdown: Candidate["breakdown"] = [];
    if (audio.length) breakdown.push({ rule: "Strongest loudness signal", points: r2(0.6 * Math.max(...audio.map((a) => a.score)) + 0.15) });
    else breakdown.push({ rule: "Rapid on-screen changes (no audio signal)", points: r2(Math.max(...g.map((a) => a.score))) });
    if (audio.some((a) => a.onset)) breakdown.push({ rule: "Sudden onset", points: 0.1 });
    if (g.length > 1) breakdown.push({ rule: `${g.length} signals close together`, points: r2(Math.min(0.24, 0.08 * (g.length - 1))) });
    const cuts = audio.length ? scenes.filter((s) => s.startMs >= eventStartMs - 2000 && s.startMs <= eventEndMs + 2000).length : 0;
    if (cuts) breakdown.push({ rule: "Picture changed during the moment", points: r2(Math.min(0.15, 0.05 * cuts)) });
    const score = r2(Math.min(1, breakdown.reduce((s, b) => s + b.points, 0)));
    if (score < RULES.minScore) continue;
    const kinds = new Set(g.map((a) => (a.kind === "visual_burst" ? "visual" : "audio")));
    if (cuts) kinds.add("visual");
    const confidence = score >= 0.65 && kinds.size > 1 ? "strong" : score >= 0.65 || score >= 0.45 ? "moderate" : "weak";
    const top = [...g].sort((a, b) => b.score - a.score)[0];
    const name = top.kind === "loudness_peak" ? "Loud moment" : top.kind === "loudness_jump" ? "Sudden loud sound" : "Rapid on-screen changes";
    const evidence = g.map((a) => a.evidence);
    if (cuts && audio.length) evidence.push({ kind: "scene_change", startMs: eventStartMs, endMs: eventEndMs, label: "Picture changed", detail: `${cuts} large picture change${cuts > 1 ? "s" : ""} nearby` });
    raw.push({ eventStartMs, eventEndMs, ...clipBounds(eventStartMs, eventEndMs, durationMs), focusMs: top.focusMs, score, confidence, title: `${name} at ${clockLabel(top.focusMs)}`, evidence, breakdown });
  }

  // Strongest first; merge or trim overlaps so no two suggestions share footage.
  const kept: Candidate[] = [];
  for (const c of [...raw].sort((a, b) => b.score - a.score)) {
    let cand: Candidate | null = c;
    for (const k of kept) {
      if (!cand || overlap(cand, k) <= 0) continue;
      const unionStart = Math.min(cand.startMs, k.startMs);
      const unionEnd = Math.max(cand.endMs, k.endMs);
      if (unionEnd - unionStart <= RULES.maxClipMs) {
        k.startMs = unionStart;
        k.endMs = unionEnd;
        k.eventStartMs = Math.min(k.eventStartMs, cand.eventStartMs);
        k.eventEndMs = Math.max(k.eventEndMs, cand.eventEndMs);
        k.evidence.push(...cand.evidence);
        if (!k.breakdown.some((b) => b.rule === "Merged with a nearby moment")) k.breakdown.push({ rule: "Merged with a nearby moment", points: 0 });
        cand = null;
      } else {
        // Too long together: give the weaker one only the footage the stronger doesn't use.
        const c0: Candidate = cand;
        const trimmed = c0.startMs < k.startMs ? { startMs: c0.startMs, endMs: k.startMs } : { startMs: k.endMs, endMs: c0.endMs };
        // Keep it only if its own key moment still fits, with enough footage.
        const keepsFocus = c0.focusMs >= trimmed.startMs && c0.focusMs <= trimmed.endMs;
        cand = trimmed.endMs - trimmed.startMs >= RULES.minClipMs && keepsFocus ? { ...c0, ...trimmed } : null;
      }
    }
    if (cand) kept.push(cand);
    if (kept.length >= RULES.maxSuggestions) break;
  }
  return kept.filter((k) => k.endMs - k.startMs < RULES.maxCoverage * durationMs).sort((a, b) => a.startMs - b.startMs);
}
