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

/**
 * A side-by-side clip around the primary's own time `ownMs`: the in/out (primary's
 * own time) clamped to where BOTH POVs have footage, and the second POV's own time
 * at the in-point. null when they overlap for less than `minMs` there.
 */
export function splitWindow(
  primary: SyncedPov,
  second: SyncedPov,
  ownMs: number,
  { beforeMs, afterMs, minMs }: { beforeMs: number; afterMs: number; minMs: number },
): { inMs: number; outMs: number; secondaryInMs: number } | null {
  // The same moment is own time t in the primary and t − lag in the second POV.
  const lag = second.offsetMs - primary.offsetMs;
  const inMs = Math.ceil(Math.max(0, lag, ownMs - beforeMs));
  const outMs = Math.floor(Math.min(primary.durationMs, lag + second.durationMs, ownMs + afterMs));
  return outMs - inMs >= minMs ? { inMs, outMs, secondaryInMs: inMs - lag } : null;
}
