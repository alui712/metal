import { describe, expect, it } from "vitest";
import { LOST_AFTER, nextPoll, type Lost } from "./poll";

type Snap = { state: string; fetchedAt: number; lost: Lost | null };
const empty = () => ({ state: "initial" });
const ok = (state: string) => ({ ok: true as const, body: { state } });
const fail = { ok: false as const, message: "server error 500" };

describe("nextPoll", () => {
  it("stores each good answer and clears a lost state", () => {
    const lost: Snap = { state: "connected", fetchedAt: 1, lost: { since: 5, message: "x" } };
    expect(nextPoll<Snap>(lost, 4, ok("connected"), 10, empty)).toEqual({ snapshot: { state: "connected", fetchedAt: 10, lost: null }, failures: 0, changed: true });
  });

  it("keeps the last answer through brief failures, then marks it lost", () => {
    let snap: Snap | null = { state: "connected", fetchedAt: 1, lost: null };
    let failures = 0;
    for (let i = 1; i < LOST_AFTER; i++) {
      const step: { snapshot: Snap | null; failures: number } = nextPoll<Snap>(snap, failures, fail, 100 + i, empty);
      expect(step.snapshot?.lost).toBeNull();
      snap = step.snapshot;
      failures = step.failures;
    }
    const r = nextPoll<Snap>(snap, failures, fail, 200, empty);
    expect(r.snapshot).toEqual({ state: "connected", fetchedAt: 1, lost: { since: 200, message: "server error 500" } });
    expect(r.changed).toBe(true);
    // Stays lost (same `since`) without re-notifying.
    expect(nextPoll<Snap>(r.snapshot, r.failures, fail, 300, empty)).toMatchObject({ changed: false, snapshot: { lost: { since: 200 } } });
  });

  it("reports lost even before any answer arrived, without inventing a state", () => {
    let r: { snapshot: Snap | null; failures: number; changed: boolean } = { snapshot: null, failures: 0, changed: false };
    for (let i = 0; i < LOST_AFTER; i++) r = nextPoll<Snap>(r.snapshot, r.failures, fail, 50, empty);
    expect(r.snapshot).toEqual({ state: "initial", fetchedAt: 0, lost: { since: 50, message: "server error 500" } });
  });
});
