import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { chunks, recordings, transcriptSegments } from "../db/schema";
import type { VisualMatch } from "../visual/search";
import { dot, embed, embedderStatus, fromBlob, toBlob } from "./embed";

// Recall over real recordings: transcript lines (FTS5 keywords + local
// embeddings) and recording metadata. Every result points at stored rows —
// a recording id, a segment's real timestamps, its text — and says why it
// matched. Nothing is generated.

export const RECALL_RULES = {
  /** Cosine similarity (all-MiniLM-L6-v2) below this isn't shown at all. */
  semanticMin: 0.35,
  /** …and at or above this counts as a good match rather than a loose one. */
  semanticGood: 0.47,
  semanticStrong: 0.6,
  /** Matching lines closer than this are one moment. */
  groupGapMs: 4000,
  maxResults: 20,
};

const STOP = new Set(
  // Function words, plus voice-chat filler that would otherwise match everything ("got", "okay").
  ("a an and are as at be but by did do does for from had has have he her him his i if in into is it its me my of on or our she so that the their them then there they this to was we were what when where which who why will with you your " +
    "got get gets getting just like yeah yes okay ok oh um uh really very can could would should im i'm he's she's it's that's there's let's gonna wanna").split(" "),
);

/** Light English stemmer: enemies/enemy → enemy, stairs → stair, pushing → push. */
export function stem(w: string): string {
  if (w.length <= 3) return w;
  return w
    .replace(/'s$/, "")
    .replace(/(ies|ied)$/, "y")
    .replace(/(sses)$/, "ss")
    .replace(/([^s])s$/, "$1")
    .replace(/(ing|ed)$/, (m, _g, i: number) => (i >= 3 ? "" : m));
}

export type RecallFilters = { recordingId?: string; game?: string; fromMs?: number; toMs?: number };
export type MatchSource = "phrase" | "keyword" | "semantic" | "title" | "visual" | "game" | "tag";
export type RecallLine = { segmentId: string; startMs: number; endMs: number; text: string; matched: string[] };
export type RecallHit = {
  recordingId: string;
  startMs: number;
  endMs: number;
  /** Where playback starts: the first matching line's real start. */
  seekMs: number;
  lines: RecallLine[];
  sources: MatchSource[];
  reasons: string[];
  score: number;
  strength: "strong" | "good" | "weak";
  /** Present when CLIP frames matched (approximate; see src/server/visual/search.ts). */
  visual?: VisualMatch;
};
export type RecallSearch = {
  query: string;
  results: RecallHit[];
  /** Only loose matches were found. */
  ambiguous: boolean;
  semantic: { available: boolean; reason: string | null };
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}' ]+/gu, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

export function parseQuery(raw: string) {
  const q = raw.trim().slice(0, 200);
  const quoted = /^"(.+)"$/.exec(q)?.[1];
  const all = words(quoted ?? q);
  const terms = [...new Set(all.filter((w) => !STOP.has(w) && w.length > 1))];
  return { text: quoted ?? q, phrase: norm(quoted ?? q), phraseRequired: Boolean(quoted), terms: terms.length ? terms : [...new Set(all)] };
}

/** Query words found in a line (prefix match: "enem" ↔ "enemies"); returns the line's own words for highlighting. */
export function matchedTerms(text: string, terms: string[]): string[] {
  const ws = words(text);
  const hit = new Set<string>();
  for (const t of terms) {
    const st = stem(t);
    for (const w of ws) if (w === t || stem(w) === st || (st.length >= 4 && w.startsWith(st))) hit.add(w);
  }
  return [...hit];
}

/** FTS5 prefix terms from stems ("enemy" → "enem"*, which also finds "enemies"). */
const ftsQuery = (terms: string[]) =>
  terms
    .map((t) => stem(t).replace(/y$/, "").replace(/["']/g, ""))
    .filter((t) => t.length >= 2)
    .map((t) => `"${t}"*`)
    .join(" OR ");

type Row = { chunkId: string; rowid: number; recordingId: string; segmentId: string; startMs: number; endMs: number; text: string; embedding: Buffer | null };

function eligible(db: Db, f: RecallFilters): Row[] {
  const conds = [eq(chunks.source, "transcript"), isNull(transcriptSegments.flaggedAt)];
  if (f.recordingId) conds.push(eq(chunks.recordingId, f.recordingId));
  if (f.game) conds.push(eq(recordings.game, f.game));
  if (f.fromMs !== undefined) conds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) >= ${f.fromMs}`);
  if (f.toMs !== undefined) conds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) < ${f.toMs}`);
  return db
    .select({
      chunkId: chunks.id,
      rowid: sql<number>`${chunks}.rowid`,
      recordingId: chunks.recordingId,
      segmentId: transcriptSegments.id,
      startMs: chunks.startMs,
      endMs: chunks.endMs,
      text: chunks.text,
      embedding: chunks.embedding,
    })
    .from(chunks)
    .innerJoin(transcriptSegments, eq(transcriptSegments.id, chunks.sourceRefId))
    .innerJoin(recordings, eq(recordings.id, chunks.recordingId))
    .where(and(...conds))
    .all();
}

/** Embeds transcript chunks that don't have a vector yet. Safe to call repeatedly. */
export async function ensureEmbeddings(db: Db, limit = 2000): Promise<number> {
  const s = embedderStatus();
  if (!s.available) return 0;
  const todo = db.select({ id: chunks.id, text: chunks.text }).from(chunks).where(and(eq(chunks.source, "transcript"), isNull(chunks.embedding))).limit(limit).all();
  if (!todo.length) return 0;
  const vecs = await embed(todo.map((t) => t.text));
  db.$client.transaction(() => {
    todo.forEach((t, i) => db.update(chunks).set({ embedding: toBlob(vecs[i]), embedModel: s.model }).where(eq(chunks.id, t.id)).run());
  })();
  return todo.length;
}

export async function searchRecall(db: Db, rawQuery: string, filters: RecallFilters = {}): Promise<RecallSearch> {
  const q = parseQuery(rawQuery);
  const status = embedderStatus();
  const semantic = status.available ? { available: true, reason: null } : { available: false, reason: status.reason };
  if (!q.phrase) return { query: q.text, results: [], ambiguous: false, semantic };

  const rows = eligible(db, filters);
  const byRow = new Map(rows.map((r) => [r.rowid, r]));
  // Keywords via the existing FTS5 index (prefix terms, OR'd).
  const kwRowids = new Set<number>();
  if (q.terms.length && !q.phraseRequired && ftsQuery(q.terms)) {
    for (const r of db.all<{ rowid: number }>(sql`select rowid from chunks_fts where chunks_fts match ${ftsQuery(q.terms)}`)) if (byRow.has(r.rowid)) kwRowids.add(r.rowid);
  }
  let qVec: Float32Array | null = null;
  if (status.available && !q.phraseRequired) {
    try {
      [qVec] = await embed([q.text]);
    } catch {
      semantic.available = false;
      semantic.reason = "Semantic search model failed to load — showing keyword matches only.";
    }
  }

  type Scored = { row: Row; score: number; sources: MatchSource[]; matched: string[]; sim: number | null; kwFrac: number };
  const scored: Scored[] = [];
  for (const row of rows) {
    const sources: MatchSource[] = [];
    let best = 0;
    const lineNorm = norm(row.text);
    const multiWord = q.phrase.includes(" ") || q.phraseRequired;
    if (multiWord && ` ${lineNorm} `.includes(` ${q.phrase} `)) {
      sources.push("phrase");
      best = 1;
    }
    if (q.phraseRequired && !sources.length) continue;
    const matched = matchedTerms(row.text, q.terms);
    let kwFrac = 0;
    if (kwRowids.has(row.rowid) && matched.length) {
      const covered = q.terms.filter((t) => matchedTerms(row.text, [t]).length).length;
      kwFrac = covered / q.terms.length;
      sources.push("keyword");
      best = Math.max(best, 0.35 + 0.5 * kwFrac);
    }
    let sim: number | null = null;
    if (qVec && row.embedding) {
      sim = dot(qVec, fromBlob(row.embedding));
      if (sim >= RECALL_RULES.semanticMin) {
        sources.push("semantic");
        best = Math.max(best, sim);
      }
    }
    if (!sources.length) continue;
    scored.push({ row, score: Math.min(1, best + 0.05 * (sources.length - 1)), sources, matched, sim, kwFrac });
  }

  // Group nearby matching lines of one recording into a moment.
  const hits: RecallHit[] = [];
  const byRec = new Map<string, Scored[]>();
  for (const s of scored) byRec.set(s.row.recordingId, [...(byRec.get(s.row.recordingId) ?? []), s]);
  for (const [recordingId, list] of byRec) {
    list.sort((a, b) => a.row.startMs - b.row.startMs);
    let group: Scored[] = [];
    const flush = () => {
      if (!group.length) return;
      const top = group.reduce((a, b) => (b.score > a.score ? b : a));
      const srcs = [...new Set(group.flatMap((g) => g.sources))];
      const reasons: string[] = [];
      if (srcs.includes("phrase")) reasons.push(`Exact phrase “${q.text}”`);
      const kw = [...new Set(group.flatMap((g) => (g.sources.includes("keyword") ? g.matched : [])))];
      if (kw.length && !srcs.includes("phrase")) reasons.push(`Matched words: ${kw.join(", ")}`);
      const sims = group.flatMap((g) => (g.sources.includes("semantic") && g.sim !== null ? [g.sim] : []));
      if (sims.length) reasons.push(`Similar meaning (similarity ${Math.max(...sims).toFixed(2)})`);
      if (group.length > 1) reasons.push(`${group.length} matching lines close together`);
      const score = Math.min(1, top.score + 0.03 * (group.length - 1));
      const strong = srcs.includes("phrase") || group.some((g) => g.kwFrac >= 0.75) || sims.some((x) => x >= RECALL_RULES.semanticStrong);
      const good = group.some((g) => g.kwFrac >= 0.4) || sims.some((x) => x >= RECALL_RULES.semanticGood);
      hits.push({
        recordingId,
        startMs: group[0].row.startMs,
        endMs: Math.max(...group.map((g) => g.row.endMs)),
        seekMs: group[0].row.startMs,
        lines: group.map((g) => ({ segmentId: g.row.segmentId, startMs: g.row.startMs, endMs: g.row.endMs, text: g.row.text, matched: g.matched })),
        sources: srcs,
        reasons,
        score: Math.round(score * 1000) / 1000,
        strength: strong ? "strong" : good ? "good" : "weak",
      });
      group = [];
    };
    for (const s of list) {
      const last = group.at(-1);
      if (last && s.row.startMs - last.row.endMs > RECALL_RULES.groupGapMs) flush();
      group.push(s);
    }
    flush();
  }

  // Recording names (the game set on a recording is matched separately: src/server/search/games.ts).
  if (!q.phraseRequired && q.terms.length) {
    const recConds = [];
    if (filters.recordingId) recConds.push(eq(recordings.id, filters.recordingId));
    if (filters.game) recConds.push(eq(recordings.game, filters.game));
    if (filters.fromMs !== undefined) recConds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) >= ${filters.fromMs}`);
    if (filters.toMs !== undefined) recConds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) < ${filters.toMs}`);
    const recs = db.select({ id: recordings.id, title: recordings.title }).from(recordings).where(recConds.length ? and(...recConds) : undefined).all();
    for (const r of recs) {
      const m = matchedTerms(r.title, q.terms);
      const frac = q.terms.filter((t) => matchedTerms(r.title, [t]).length).length / q.terms.length;
      if (!m.length || frac < 0.5) continue;
      hits.push({ recordingId: r.id, startMs: 0, endMs: 0, seekMs: 0, lines: [], sources: ["title"], reasons: [`Recording name matches: ${m.join(", ")}`], score: 0.3 + 0.3 * frac, strength: frac === 1 ? "good" : "weak" });
    }
  }

  const rank = { strong: 2, good: 1, weak: 0 };
  hits.sort((a, b) => rank[b.strength] - rank[a.strength] || b.score - a.score);
  // Loose matches only when nothing better exists (then the response says it's ambiguous).
  const confident = hits.filter((h) => h.strength !== "weak");
  const results = (confident.length ? confident : hits).slice(0, RECALL_RULES.maxResults);
  return { query: q.text, results, ambiguous: results.length > 0 && results.every((r) => r.strength === "weak"), semantic };
}

/** Index coverage, so the UI can say honestly what's searchable. */
export function recallIndexStats(db: Db) {
  const segs = db.select({ n: sql<number>`count(*)`, recs: sql<number>`count(distinct ${transcriptSegments.recordingId})` }).from(transcriptSegments).where(isNull(transcriptSegments.flaggedAt)).get();
  const embedded = db.select({ n: sql<number>`count(*)` }).from(chunks).where(and(eq(chunks.source, "transcript"), sql`${chunks.embedding} is not null`)).get();
  const flagged = db.select({ n: sql<number>`count(*)` }).from(transcriptSegments).where(sql`${transcriptSegments.flaggedAt} is not null`).get();
  return { segments: segs?.n ?? 0, recordings: segs?.recs ?? 0, embedded: embedded?.n ?? 0, flagged: flagged?.n ?? 0 };
}

/** Marks a transcript line wrong (or restores it). Flagged lines leave the search index. */
export function flagSegment(db: Db, segmentId: string, flagged: boolean): boolean {
  const seg = db.select().from(transcriptSegments).where(eq(transcriptSegments.id, segmentId)).get();
  if (!seg) return false;
  db.$client.transaction(() => {
    db.update(transcriptSegments).set({ flaggedAt: flagged ? Date.now() : null }).where(eq(transcriptSegments.id, segmentId)).run();
    db.delete(chunks).where(and(eq(chunks.source, "transcript"), eq(chunks.sourceRefId, segmentId))).run();
    if (!flagged) {
      db.insert(chunks).values({ id: `chk_${segmentId.slice(4)}`, recordingId: seg.recordingId, source: "transcript", sourceRefId: segmentId, startMs: seg.startMs, endMs: seg.endMs, text: seg.text }).run();
    }
  })();
  return true;
}

export const isSegmentId = (id: string) => /^seg_[0-9a-f]{16}$/.test(id);
