import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { recordings } from "../db/schema";
import { catalogGame, genreLabels, isGenericWord, normalize, parseGameQuery, type GameQuery } from "@/lib/games/catalog";
import type { RecallFilters, RecallHit, RecallSearch } from "./recall";

// Recall by game and genre (src/lib/games/catalog.ts): a recording matches
// only through the game a person set on it, and a genre only through METAL's
// game list. These are whole-recording matches — they never point at a
// moment or claim anything about what's on screen.

export type GameSearch = {
  hits: RecallHit[];
  /** What the search asked for, and how many recordings have a game set (for honest empty states). */
  status: { genres: string[]; games: string[]; rest: string; tagged: number };
};

export function searchGames(db: Db, q: string, f: RecallFilters): GameSearch {
  const conds = [isNotNull(recordings.game)];
  if (f.recordingId) conds.push(eq(recordings.id, f.recordingId));
  if (f.game) conds.push(eq(recordings.game, f.game));
  if (f.fromMs !== undefined) conds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) >= ${f.fromMs}`);
  if (f.toMs !== undefined) conds.push(sql`coalesce(${recordings.recordedAt}, ${recordings.importedAt}) < ${f.toMs}`);
  const recs = db.select({ id: recordings.id, game: recordings.game }).from(recordings).where(and(...conds)).all();
  const known = db.selectDistinct({ game: recordings.game }).from(recordings).where(isNotNull(recordings.game)).all().flatMap((r) => (r.game ? [r.game] : []));
  const gq = parseGameQuery(q, known);
  const tagged = db.select({ n: sql<number>`count(*)` }).from(recordings).where(isNotNull(recordings.game)).get()?.n ?? 0;
  const status = { genres: genreLabels(gq.genres), games: gq.games, rest: gq.rest, tagged };
  if (!gq.genres.length && !gq.games.length) return { hits: [], status };
  return { hits: recs.flatMap((r) => gameHit(r.id, r.game!, gq)), status };
}

/** Pure: one whole-recording hit when the recording's game is named, or is in an asked-for genre. */
export function gameHit(recordingId: string, game: string, gq: GameQuery): RecallHit[] {
  const entry = catalogGame(game);
  const name = entry?.name ?? game;
  const named = gq.games.includes(normalize(name));
  const genres = entry ? entry.genres.filter((g) => gq.genres.includes(g)) : [];
  if (!named && !genres.length) return [];
  const reasons = [named ? `Game: ${name} (set on this recording)` : `Game: ${name} (set on this recording) — a ${genreLabels(genres).join(" and ")} in METAL’s game list`];
  // Only part of the search is about the game: say so, and keep it a loose match.
  if (gq.rest) reasons.push(`Only the game matched — nothing here confirms “${gq.rest}”`);
  return [{ recordingId, startMs: 0, endMs: 0, seekMs: 0, lines: [], sources: ["game"], reasons, score: named ? 0.62 : 0.58, strength: gq.rest ? "weak" : "good" }];
}

/**
 * Pure: in a search that is only a game or genre ("shooter game"), a spoken
 * line that matched just a generic word ("Good game everyone") says nothing
 * about the game — it becomes a loose match. Lines that name the game, or
 * match by meaning or exact phrase, are untouched.
 */
export function demoteGenericSpeech(search: RecallSearch, status: GameSearch["status"]): RecallSearch {
  if (status.rest || (!status.genres.length && !status.games.length)) return search;
  const generic = (h: RecallHit) =>
    h.lines.length > 0 && h.sources.every((s) => s === "keyword") && h.lines.every((l) => l.matched.every(isGenericWord));
  return {
    ...search,
    results: search.results.map((h) =>
      generic(h) ? { ...h, strength: "weak", reasons: [...h.reasons, `Only the common word “${[...new Set(h.lines.flatMap((l) => l.matched))].join("”, “")}” was said — not the game`] } : h,
    ),
  };
}

/**
 * Pure: adds game matches to a Recall result. A recording that already
 * matched (lines, scenes, name) gets the game as one more reason on its best
 * hit; otherwise the game match stands alone as a whole-recording result.
 */
export function mergeGames(search: RecallSearch, games: RecallHit[]): RecallSearch {
  const merged = search.results.map((h) => ({ ...h }));
  for (const g of games) {
    const same = merged.find((h) => h.recordingId === g.recordingId);
    if (same && !same.sources.includes("game")) {
      same.sources = [...same.sources, "game"];
      same.reasons = [...same.reasons, g.reasons[0]];
      if (g.strength !== "weak" && same.strength === "weak") same.strength = "good";
      if (g.strength !== "weak") same.score = Math.min(1, Math.round((same.score + 0.1) * 1000) / 1000);
    } else if (!same) merged.push(g);
  }
  const rank = { strong: 2, good: 1, weak: 0 };
  merged.sort((a, b) => rank[b.strength] - rank[a.strength] || b.score - a.score);
  const confident = merged.filter((h) => h.strength !== "weak");
  const results = (confident.length ? confident : merged).slice(0, 20);
  return { ...search, results, ambiguous: results.length > 0 && results.every((r) => r.strength === "weak") };
}
