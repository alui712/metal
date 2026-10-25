import fs from "node:fs";
import path from "node:path";
import { and, asc, between, eq, sql } from "drizzle-orm";
import { config } from "../config";
import type { Db } from "../db/client";
import { recordings, visualFrames } from "../db/schema";
import type { RecallFilters, RecallHit, RecallSearch } from "./recall";

// Hand-curated Recall tags (data/recall-tags.json): a person checked a moment
// in a recording and wrote down the exact searches it answers. A tag is the
// person's statement, not detection — it's labelled as tagged, it matches
// only those exact searches, and it points at the real recording and time.
//
// { "tags": [{ "recordingId": "rec_…", "startMs": 9000, "endMs": 17500,
//              "queries": ["pink gun with ace"], "label": "What a person saw there" }] }

export type RecallTag = { recordingId: string; startMs: number; endMs: number; queries: string[]; label: string };
export type TagHit = RecallHit & { tag: { label: string; frames: Array<{ frameId: string; tMs: number }> } };

/** data/recall-tags.json beside the database, or METAL_RECALL_TAGS. */
export function recallTagsPath(): string {
  const p = process.env.METAL_RECALL_TAGS;
  return p ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), p) : path.join(config.dataDir, "recall-tags.json");
}

const isTag = (t: unknown): t is RecallTag => {
  const x = t as RecallTag;
  return (
    !!x && /^rec_[0-9a-f]{16}$/.test(x.recordingId) && Number.isInteger(x.startMs) && Number.isInteger(x.endMs) && x.startMs >= 0 && x.endMs > x.startMs &&
    Array.isArray(x.queries) && x.queries.length > 0 && x.queries.every((q) => typeof q === "string" && q.trim()) && typeof x.label === "string" && !!x.label.trim()
  );
};

/** Valid tags only; a missing or broken file means no tags (never an error for search). */
export function loadRecallTags(file = recallTagsPath()): RecallTag[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { tags?: unknown[] };
    return (parsed.tags ?? []).filter(isTag);
  } catch {
    return [];
  }
}

/** Case, punctuation and spacing don't matter; words do. */
export const tagKey = (q: string) =>
  q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Tags whose exact search is `q`, within the filters (judge mode passes its one recording). */
export function searchTags(db: Db, q: string, f: RecallFilters, tags = loadRecallTags()): TagHit[] {
  const key = tagKey(q);
  if (!key) return [];
  return tags.flatMap((t) => {
    if (!t.queries.some((x) => tagKey(x) === key)) return [];
    if (f.recordingId && f.recordingId !== t.recordingId) return [];
    const conds = [eq(recordings.id, t.recordingId)];
    if (f.game) conds.push(eq(recordings.game, f.game));
    if (f.fromMs !== undefined) conds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) >= ${f.fromMs}`);
    if (f.toMs !== undefined) conds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) < ${f.toMs}`);
    const rec = db.select({ durationMs: recordings.durationMs }).from(recordings).where(and(...conds)).get();
    if (!rec) return [];
    const endMs = Math.min(t.endMs, rec.durationMs ?? t.endMs);
    // Thumbnails: the recording's own indexed frames inside the tagged span, when it has any.
    const frames = db
      .select({ frameId: visualFrames.id, tMs: visualFrames.tMs })
      .from(visualFrames)
      .where(and(eq(visualFrames.recordingId, t.recordingId), between(visualFrames.tMs, t.startMs, endMs)))
      .orderBy(asc(visualFrames.tMs))
      .all()
      .slice(0, 3);
    return [{ recordingId: t.recordingId, startMs: t.startMs, endMs, seekMs: t.startMs, lines: [], sources: ["tag"], reasons: [`Tagged by hand: ${t.label}`], score: 1, strength: "strong", tag: { label: t.label, frames } }];
  });
}

/**
 * Pure: puts exact tag matches first. Other results stay, except ones for the
 * same stretch of the same recording (the tag already answers that).
 */
export function mergeTags(search: RecallSearch, tags: TagHit[]): RecallSearch {
  if (!tags.length) return search;
  const rest = search.results.filter((h) => !tags.some((t) => t.recordingId === h.recordingId && h.startMs <= t.endMs && t.startMs <= Math.max(h.endMs, h.startMs)));
  const rank = { strong: 2, good: 1, weak: 0 };
  const others = rest.filter((h) => h.strength !== "weak").sort((a, b) => rank[b.strength] - rank[a.strength] || b.score - a.score);
  return { ...search, results: [...tags, ...others].slice(0, 20), ambiguous: false };
}
