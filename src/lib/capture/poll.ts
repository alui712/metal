// Pure transition for the client's capture poller. A failed poll keeps the last
// answer for a moment (the server may be restarting), but after LOST_AFTER
// consecutive failures the snapshot is marked lost so the UI stops showing a
// stale "Connected" and disables controls.

export const LOST_AFTER = 3;

export type Lost = { since: number; message: string };

export type PollResult = { ok: true; body: object } | { ok: false; message: string };

export function nextPoll<T extends { fetchedAt: number; lost: Lost | null }>(
  prev: T | null,
  failures: number,
  result: PollResult,
  now: number,
  empty: () => Omit<T, "fetchedAt" | "lost">,
): { snapshot: T | null; failures: number; changed: boolean } {
  if (result.ok) return { snapshot: { ...(result.body as T), fetchedAt: now, lost: null }, failures: 0, changed: true };
  const n = failures + 1;
  if (n < LOST_AFTER || prev?.lost) return { snapshot: prev, failures: n, changed: false };
  const base = prev ?? ({ ...empty(), fetchedAt: 0 } as T);
  return { snapshot: { ...base, lost: { since: now, message: result.message } }, failures: n, changed: true };
}
