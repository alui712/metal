import type { SessionDetail } from "@/lib/timemachine/types";

// Judge mode: pages and APIs opened with `?judge=1` (only the guided tour adds
// it) show approved content only, filtered on the server. Without the flag the
// same routes are the normal, unrestricted app. This is a presentation scope,
// not access control: anyone can drop the flag and see the whole library.

export const JUDGE_PARAM = "judge";
export const isJudge = (v: unknown) => v === "1" || (Array.isArray(v) && v[0] === "1");

/** The night limited to approved, playable recordings and their moments; counts recomputed. */
export function scopeSession(d: SessionDetail, allowed: ReadonlySet<string>, coverUrl: string | null): SessionDetail {
  const recordings = d.recordings.filter((r) => allowed.has(r.id) && r.videoUrl);
  const keep = new Set(recordings.map((r) => r.id));
  const moments = d.moments.filter((m) => keep.has(m.recordingId));
  return {
    summary: {
      ...d.summary,
      recordingCount: recordings.length,
      footageMs: recordings.reduce((n, r) => n + r.durationMs, 0),
      momentCount: moments.length,
      favoriteCount: moments.filter((m) => m.favorite).length,
      // Per-recording line counts aren't part of the timeline view; don't show a library-wide number.
      transcriptLines: 0,
      analyzedCount: recordings.filter((r) => r.analysis === "done").length,
      coverUrl,
    },
    recordings,
    moments,
    others: [],
  };
}

type StoryLike = {
  recordings: Record<string, unknown>;
  moments: Record<string, { recordingId: string }>;
  candidates: Array<{ recordingId: string }>;
  sourceSession: { id: string; title: string } | null;
};

/** A story's editor data limited to approved recordings (candidate clips included). */
export function scopeStory<V extends StoryLike>(v: V, allowed: ReadonlySet<string>, nightId: string | null): V {
  return {
    ...v,
    recordings: Object.fromEntries(Object.entries(v.recordings).filter(([id]) => allowed.has(id))),
    moments: Object.fromEntries(Object.entries(v.moments).filter(([, m]) => allowed.has(m.recordingId))),
    candidates: v.candidates.filter((m) => allowed.has(m.recordingId)),
    sourceSession: v.sourceSession && v.sourceSession.id === nightId ? v.sourceSession : null,
  };
}

export type RecallScope = { recordingId: string } | { error: string };

/**
 * The prepared Recall search runs on the approved line's recording only. Other
 * filters would silently change the guided result, so they are refused rather than applied.
 */
export function judgeRecallScope(params: URLSearchParams, prepared: string | null, allowed: ReadonlySet<string>): RecallScope {
  if (!prepared) return { error: "No Recall search is prepared for the demo." };
  if (["game", "from", "to"].some((k) => params.get(k))) return { error: "Filters are off in the prepared demo. Leave the demo scope to filter your library." };
  const rec = params.get("recording");
  if (rec !== prepared || !allowed.has(rec)) return { error: "The prepared demo searches only its approved recording." };
  return { recordingId: rec };
}
