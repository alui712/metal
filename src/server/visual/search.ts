import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { recordings, recordingVisualIndex, visualFrames } from "../db/schema";
import type { RecallFilters, RecallHit, RecallSearch } from "../search/recall";
import { dot, fromBlob } from "../search/embed";
import { embedText, visualModelStatus } from "./clip";

// Visual Recall over indexed frames (ADR 0022): CLIP text↔image cosine
// similarity. A match means "this frame looks like the description" — it
// never proves an action or event happened. Every hit points at stored
// frames (recording id, real timestamp, the frame file) and says how close
// the match was. Nothing is generated.

export const VISUAL_RULES = {
  /**
   * CLIP ViT-B/16 cosine floors, calibrated on 581 frames from 21 real
   * gaming recordings (docs/visual-recall.md). Unrelated descriptions
   * peaked at 0.258; true scenes usually reach ≥ 0.30.
   */
  likelyMin: 0.3,
  /** Shown only when nothing reaches `likelyMin`, and labelled low confidence. */
  possibleMin: 0.27,
  maxLowConfidence: 3,
  /**
   * Within a recording, only frames this close to its best frame count —
   * otherwise a long run of vaguely similar frames swallows the actual scene.
   */
  peakBand: 0.012,
  /** Matching frames closer than this are one moment. */
  groupGapMs: 4500,
  /** Playback starts this long before the first matching frame. */
  leadInMs: 1000,
  maxResults: 12,
  previewFrames: 3,
};

export type VisualEvidence = { frameId: string; tMs: number; similarity: number };
export type VisualMatch = { confidence: "likely" | "low"; similarity: number; frames: VisualEvidence[]; model: string; intervalMs: number };
export type VisualSearch = {
  hits: Array<RecallHit & { visual: VisualMatch }>;
  status: { available: boolean; reason: string | null; frames: number; recordings: number; eventQuery: boolean };
};

/**
 * Words that ask for a game event (kills, deaths, aces, round results).
 * CLIP can't recognise events: in validation "an ace" scored a confident
 * match only because an ACE banner was on screen. Such queries still get
 * visual matches, but never above low confidence.
 */
const EVENT_WORDS = /\b(?:kill(?:s|ed|ing)?|multi-?kills?|double kill|triple kill|quadra|penta|[2-5]k|aces?|died|dies|dying|deaths?|headshots?|clutch(?:ed|es)?|won|wins?|victory|defeat(?:ed)?|eliminat\w*|knocked|downed|respawn\w*)\b/i;
export const isEventQuery = (q: string) => EVENT_WORDS.test(q);

/** Pure: event queries keep only a few low-confidence moments, with a reason saying why. */
export function capForEvents(hits: VisualSearch["hits"]): VisualSearch["hits"] {
  return hits.slice(0, VISUAL_RULES.maxLowConfidence).map((h) => ({
    ...h,
    strength: "weak",
    reasons: [...h.reasons, "Visual search can’t recognise game events — these frames only look similar"],
    visual: { ...h.visual, confidence: "low" },
  }));
}

type Row = { id: string; recordingId: string; tMs: number; embedding: Buffer; model: string; intervalMs: number | null };

function eligible(db: Db, f: RecallFilters, model: string): Row[] {
  const conds = [eq(visualFrames.model, model), eq(recordingVisualIndex.status, "done")];
  if (f.recordingId) conds.push(eq(visualFrames.recordingId, f.recordingId));
  if (f.game) conds.push(eq(recordings.game, f.game));
  if (f.fromMs !== undefined) conds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) >= ${f.fromMs}`);
  if (f.toMs !== undefined) conds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) < ${f.toMs}`);
  return db
    .select({ id: visualFrames.id, recordingId: visualFrames.recordingId, tMs: visualFrames.tMs, embedding: visualFrames.embedding, model: visualFrames.model, intervalMs: recordingVisualIndex.intervalMs })
    .from(visualFrames)
    .innerJoin(recordings, eq(recordings.id, visualFrames.recordingId))
    .innerJoin(recordingVisualIndex, eq(recordingVisualIndex.recordingId, visualFrames.recordingId))
    .where(and(...conds))
    .all();
}

export function visualIndexStats(db: Db) {
  const r = db.select({ n: sql<number>`count(*)`, recs: sql<number>`count(distinct ${visualFrames.recordingId})` }).from(visualFrames).get();
  return { frames: r?.n ?? 0, recordings: r?.recs ?? 0 };
}

/** Pure: scored frames → grouped, labelled moments. */
export function groupVisual(scored: Array<{ row: Row; sim: number }>, durations: Map<string, number | null>): Array<RecallHit & { visual: VisualMatch }> {
  const R = VISUAL_RULES;
  const passing = scored.filter((s) => s.sim >= R.possibleMin);
  const byRec = new Map<string, typeof passing>();
  for (const s of passing) byRec.set(s.row.recordingId, [...(byRec.get(s.row.recordingId) ?? []), s]);
  const hits: Array<RecallHit & { visual: VisualMatch }> = [];
  for (const [recordingId, all] of byRec) {
    const peak = Math.max(...all.map((s) => s.sim));
    const list = all.filter((s) => s.sim >= peak - R.peakBand).sort((a, b) => a.row.tMs - b.row.tMs);
    let group: typeof list = [];
    const flush = () => {
      if (!group.length) return;
      const best = Math.max(...group.map((g) => g.sim));
      const confidence = best >= R.likelyMin ? "likely" : "low";
      const interval = group[0].row.intervalMs ?? 2000;
      const dur = durations.get(recordingId) ?? Infinity;
      // A frame stands for the sampling interval around it, so the moment spans ±half an interval.
      const startMs = Math.max(0, group[0].row.tMs - interval / 2);
      const endMs = Math.min(dur, group.at(-1)!.row.tMs + interval / 2);
      const top = [...group].sort((a, b) => b.sim - a.sim).slice(0, R.previewFrames);
      const r3 = (x: number) => Math.round(x * 1000) / 1000;
      hits.push({
        recordingId,
        startMs: Math.round(startMs),
        endMs: Math.round(endMs),
        seekMs: Math.max(0, group[0].row.tMs - R.leadInMs),
        lines: [],
        sources: ["visual"],
        reasons: [
          `Looks similar to the description (CLIP similarity ${best.toFixed(2)})`,
          `${group.length} matching frame${group.length === 1 ? "" : "s"} sampled every ${(interval / 1000).toFixed(interval % 1000 ? 1 : 0)} s`,
        ],
        // Same 0–1 scale Recall sorts on: 0.30 → 0.5, 0.35 → 0.75.
        score: r3(Math.max(0, Math.min(1, 0.5 + (best - R.likelyMin) * 5))),
        strength: confidence === "likely" ? "good" : "weak",
        visual: { confidence, similarity: r3(best), frames: top.map((t) => ({ frameId: t.row.id, tMs: t.row.tMs, similarity: r3(t.sim) })), model: group[0].row.model, intervalMs: interval },
      });
      group = [];
    };
    for (const s of list) {
      const last = group.at(-1);
      if (last && s.row.tMs - last.row.tMs > R.groupGapMs) flush();
      group.push(s);
    }
    flush();
  }
  hits.sort((a, b) => b.visual.similarity - a.visual.similarity);
  const likely = hits.filter((h) => h.visual.confidence === "likely");
  return likely.length ? likely.slice(0, R.maxResults) : hits.slice(0, R.maxLowConfidence);
}

/**
 * Pure: turns a search request into a scene description for CLIP —
 * "Find when I was holding a sniper" → "holding a sniper".
 */
export function describeScene(raw: string): string {
  let q = raw.trim().replace(/^"(.+)"$/, "$1").replace(/[?.!]+$/, "");
  const lead = /^(?:please\s+)?(?:find|show(?:\s+me)?|search(?:\s+for)?|look\s+for|get|give\s+me|where(?:'s|\s+is|\s+was)?|when)\s+/i;
  const filler = /^(?:all\s+)?(?:the\s+)?(?:(?:scenes?|moments?|clips?|times?|parts?)\s+)?(?:(?:where|when|that|with|of)\s+)?(?:(?:i|we)\s+(?:was|were|am|are)\s+)?/i;
  for (let i = 0; i < 3; i++) {
    const next = q.replace(lead, "").replace(filler, "");
    if (next === q) break;
    q = next;
  }
  return q.trim() || raw.trim();
}

export async function searchVisual(db: Db, rawQuery: string, filters: RecallFilters = {}): Promise<VisualSearch> {
  const q = describeScene(rawQuery).slice(0, 200);
  const s = visualModelStatus();
  const stats = { ...visualIndexStats(db), eventQuery: isEventQuery(q) };
  if (!s.available) return { hits: [], status: { available: false, reason: s.reason, ...stats } };
  // Quoted queries ask for exact spoken words — not a visual description.
  if (!q || /^".+"$/.test(rawQuery.trim()) || !stats.frames) return { hits: [], status: { available: true, reason: null, ...stats } };
  const rows = eligible(db, filters, s.model);
  if (!rows.length) return { hits: [], status: { available: true, reason: null, ...stats } };
  let qv: Float32Array;
  try {
    qv = await embedText(q);
  } catch {
    return { hits: [], status: { available: false, reason: "Visual search model failed to load.", ...stats } };
  }
  const scored = rows.map((row) => ({ row, sim: dot(qv, fromBlob(row.embedding)) }));
  const ids = [...new Set(rows.map((r) => r.recordingId))];
  const durations = new Map(ids.map((id) => [id, db.select({ d: recordings.durationMs }).from(recordings).where(eq(recordings.id, id)).get()?.d ?? null]));
  const hits = groupVisual(scored, durations);
  return { hits: stats.eventQuery ? capForEvents(hits) : hits, status: { available: true, reason: null, ...stats } };
}

/**
 * Combines transcript Recall with visual matches. A visual moment that
 * overlaps a transcript hit in the same recording corroborates it (adds the
 * frames and a small boost); otherwise it is its own result. Visual-only
 * moments are never "strong": they are approximate by nature.
 */
export function mergeRecall(text: RecallSearch, visual: VisualSearch["hits"]): RecallSearch {
  const merged: RecallHit[] = text.results.map((h) => ({ ...h }));
  for (const v of visual) {
    const overlap = merged.find((h) => h.recordingId === v.recordingId && h.lines.length && h.startMs <= v.endMs + 1500 && v.startMs <= h.endMs + 1500);
    if (overlap && !overlap.visual) {
      overlap.visual = v.visual;
      overlap.sources = [...overlap.sources, "visual"];
      overlap.reasons = [...overlap.reasons, v.reasons[0]];
      if (v.visual.confidence === "likely") overlap.score = Math.min(1, Math.round((overlap.score + 0.05) * 1000) / 1000);
    } else merged.push(v);
  }
  const rank = { strong: 2, good: 1, weak: 0 };
  merged.sort((a, b) => rank[b.strength] - rank[a.strength] || b.score - a.score);
  const confident = merged.filter((h) => h.strength !== "weak");
  const results = (confident.length ? confident : merged).slice(0, 20);
  return { ...text, results, ambiguous: results.length > 0 && results.every((r) => r.strength === "weak") };
}
