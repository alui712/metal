import type {
  Evidence,
  EvidenceKind,
  Moment,
  SearchFilters,
  SearchResult,
} from "../contracts";

// Demo search: transparent keyword matching over fixture text. This is NOT
// semantic search — that arrives with real embeddings. The UI labels it.

export const DEMO_SEARCH_METHOD = "Keyword match over demo fixtures";

const STOP_WORDS = new Set(
  "a an and the of to in on at for with when where was were is it i we my our me us that this those these what who how did do does got get from by be been".split(
    " ",
  ),
);

/** Crude stemmer: good enough to match "clutched"→"clutch", "laughing"→"laugh". */
export function stem(word: string): string {
  return word
    .replace(/(ing|ed|es|s)$/u, "")
    .replace(/(.)\1$/u, "$1");
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function matchTerms(text: string, queryStems: Set<string>): string[] {
  const out = new Set<string>();
  for (const raw of text.split(/[^\p{L}\p{N}]+/u)) {
    if (raw && queryStems.has(stem(raw.toLowerCase()))) out.add(raw);
  }
  return [...out];
}

const WEIGHTS: Record<EvidenceKind, number> = {
  title: 3,
  speech: 2,
  visual: 2,
  audio: 1,
};

type Context = {
  recordingOf: (m: Moment) => SearchResult["recording"];
  sessionOf: (m: Moment) => SearchResult["session"];
  gameNameOf: (gameId: string) => string;
};

export function searchMoments(
  query: string,
  all: Moment[],
  ctx: Context,
  filters: SearchFilters = {},
): SearchResult[] {
  const queryStems = new Set(tokenize(query).map(stem));
  if (queryStems.size === 0) return [];

  const results: SearchResult[] = [];
  for (const moment of all) {
    const recording = ctx.recordingOf(moment);
    if (filters.gameIds?.length && !filters.gameIds.includes(recording.gameId)) continue;

    const evidence: Evidence[] = [];
    const titleHits = matchTerms(
      `${moment.title} ${moment.tags.join(" ")} ${ctx.gameNameOf(recording.gameId)}`,
      queryStems,
    );
    if (titleHits.length) {
      evidence.push({ kind: "title", text: moment.title, matched: titleHits, tMs: moment.startMs });
    }
    for (const line of moment.transcript) {
      const hits = matchTerms(line.text, queryStems);
      if (hits.length) {
        evidence.push({ kind: "speech", text: line.text, matched: hits, tMs: line.tMs, speaker: line.speaker });
      }
    }
    const visualHits = matchTerms(moment.caption, queryStems);
    if (visualHits.length) {
      evidence.push({ kind: "visual", text: moment.caption, matched: visualHits, tMs: moment.startMs });
    }
    // Loud moments match "loud/hype/scream/shout" style queries.
    const wantsLoud = ["loud", "hype", "scream", "shout", "yell"].some((w) => queryStems.has(w));
    if (wantsLoud && moment.audioPeak !== null && moment.audioPeak >= 0.85) {
      evidence.push({
        kind: "audio",
        text: `Audio peak ${Math.round(moment.audioPeak * 100)}% of max loudness`,
        matched: [],
        tMs: moment.startMs,
      });
    }

    const kept = filters.evidence?.length
      ? evidence.filter((e) => e.kind === "title" || filters.evidence!.includes(e.kind))
      : evidence;
    if (filters.evidence?.length && !kept.some((e) => filters.evidence!.includes(e.kind))) continue;
    if (kept.length === 0) continue;

    const matchedStems = new Set(kept.flatMap((e) => e.matched.map((m) => stem(m.toLowerCase()))));
    const coverage = matchedStems.size / queryStems.size;
    const weight = kept.reduce((sum, e) => sum + WEIGHTS[e.kind], 0);
    const score = coverage * 0.7 + Math.min(weight / 8, 1) * 0.2 + moment.score * 0.1;

    const firstSpoken = kept.find((e) => e.kind === "speech");
    results.push({
      moment,
      recording,
      session: ctx.sessionOf(moment),
      score,
      // Start slightly before the matched line so the context is audible.
      seekMs: Math.max(moment.startMs, (firstSpoken?.tMs ?? moment.startMs) - 2000),
      evidence: kept.sort((a, b) => WEIGHTS[b.kind] - WEIGHTS[a.kind]),
    });
  }
  return results.sort((a, b) => b.score - a.score || b.moment.score - a.moment.score);
}
