import { describe, expect, it } from "vitest";
import { initialRelive, reliveReducer, type ReliveAction } from "./relive";

const run = (count: number, ...as: ReliveAction["type"][]) => as.reduce((s, type) => reliveReducer(s, { type } as ReliveAction), initialRelive(count));

describe("Relive state", () => {
  it("plays moments in order and finishes after the last", () => {
    expect(run(3)).toMatchObject({ index: 0, playing: true });
    expect(run(3, "ended", "ended")).toMatchObject({ index: 2, playing: true, done: false });
    expect(run(3, "ended", "ended", "ended")).toMatchObject({ index: 2, playing: false, done: true });
  });
  it("pauses, resumes, skips back and forward", () => {
    expect(run(3, "toggle")).toMatchObject({ playing: false });
    expect(run(3, "toggle", "toggle")).toMatchObject({ playing: true });
    expect(run(3, "pause", "next")).toMatchObject({ index: 1, playing: true });
    expect(run(3, "next", "prev", "prev")).toMatchObject({ index: 0 });
    expect(reliveReducer(run(3), { type: "jump", index: 2 }).index).toBe(2);
    expect(reliveReducer(run(3), { type: "jump", index: 9 }).index).toBe(0);
  });
  it("skips unplayable moments and remembers them", () => {
    expect(run(3, "error")).toMatchObject({ index: 1, failed: [0], playing: true });
    expect(run(2, "next", "error")).toMatchObject({ done: true, failed: [1] });
  });
  it("exit is final; nothing to play is done at once", () => {
    const s = run(3, "exit");
    expect(s).toMatchObject({ exited: true, playing: false });
    expect(reliveReducer(s, { type: "next" })).toBe(s);
    expect(initialRelive(0)).toMatchObject({ done: true, playing: false });
    expect(run(2, "ended", "ended", "restart")).toMatchObject({ index: 0, done: false, playing: true });
  });
});
