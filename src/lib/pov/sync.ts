// Group time ↔ a POV's own time (ADR 0019). A member's 0:00 sits at
// `offsetMs` on the group timeline, so the same moment is
// group time T = own time t + offsetMs in every POV.

export type SyncedPov = { offsetMs: number; durationMs: number };

export const toGroupTime = (p: SyncedPov, ownMs: number) => ownMs + p.offsetMs;
export const toOwnTime = (p: SyncedPov, groupMs: number) => groupMs - p.offsetMs;

/** Whether a POV has footage at group time T (it may start later or end earlier than others). */
export function coverage(p: SyncedPov, groupMs: number): "before" | "inside" | "after" {
  const t = toOwnTime(p, groupMs);
  return t < 0 ? "before" : t > p.durationMs ? "after" : "inside";
}

/** The closest group time at which this POV has footage. */
export const nearestCovered = (p: SyncedPov, groupMs: number) => Math.min(Math.max(groupMs, p.offsetMs), p.offsetMs + p.durationMs);

/** One frame at this POV's frame rate (for frame-accurate nudging); 1/30 s when unknown. */
export const frameMs = (fps: number | null | undefined) => 1000 / (fps && fps > 0 ? fps : 30);

/** "+12.25 s" / "−0.04 s": offsets to the hundredth (sync needs it). */
export function signedSeconds(ms: number): string {
  return `${ms < 0 ? "−" : "+"}${(Math.abs(ms) / 1000).toFixed(2)} s`;
}
