import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { audioEvents, clipSuggestions } from "../db/schema";
import { newId } from "../ids";
import { buildCandidates, type Signal } from "./candidates";

/**
 * Rebuilds a recording's open suggestions from its stored signals. Accepted
 * and dismissed suggestions are kept as decided; new candidates that mostly
 * overlap them are skipped, so re-analysis never resurrects a dismissed clip.
 */
export function regenerateSuggestions(db: Db, recordingId: string, durationMs: number, version: string): number {
  const signals = db
    .select()
    .from(audioEvents)
    .where(eq(audioEvents.recordingId, recordingId))
    .all()
    .map((e) => ({ kind: e.kind, startMs: e.startMs, endMs: e.endMs, score: e.score, evidence: JSON.parse(e.evidenceJson) }) as Signal);
  const candidates = buildCandidates(signals, durationMs);
  db.delete(clipSuggestions).where(and(eq(clipSuggestions.recordingId, recordingId), eq(clipSuggestions.status, "suggested"))).run();
  const decided = db
    .select({ startMs: clipSuggestions.startMs, endMs: clipSuggestions.endMs })
    .from(clipSuggestions)
    .where(and(eq(clipSuggestions.recordingId, recordingId), inArray(clipSuggestions.status, ["accepted", "dismissed"])))
    .all();
  let n = 0;
  for (const c of candidates) {
    const len = c.endMs - c.startMs;
    if (decided.some((d) => Math.min(d.endMs, c.endMs) - Math.max(d.startMs, c.startMs) > len / 2)) continue;
    db.insert(clipSuggestions)
      .values({
        id: newId("clp"),
        recordingId,
        eventStartMs: c.eventStartMs,
        eventEndMs: c.eventEndMs,
        suggestedStartMs: c.startMs,
        suggestedEndMs: c.endMs,
        startMs: c.startMs,
        endMs: c.endMs,
        score: c.score,
        confidence: c.confidence,
        title: c.title,
        evidenceJson: JSON.stringify({ focusMs: c.focusMs, items: c.evidence }),
        breakdownJson: JSON.stringify(c.breakdown),
        analysisVersion: version,
      })
      .run();
    n++;
  }
  return n;
}
