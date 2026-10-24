import { describe, expect, it } from "vitest";
import type { StoryProject } from "../memory/contracts";
import {
  MIN_CLIP_MS,
  applyOp,
  historyReducer,
  initHistory,
  locate,
  totalDuration,
} from "./edl";

const clip = (id: string, inMs: number, outMs: number) => ({
  id,
  recordingId: "rec",
  momentId: null,
  inMs,
  outMs,
  caption: null,
});

const project: StoryProject = {
  id: "p",
  title: "Test",
  aspect: "16:9",
  captions: true,
  sourceSessionId: null,
  clips: [clip("a", 0, 5000), clip("b", 10_000, 12_000), clip("c", 20_000, 23_000)],
};

const ids = (p: StoryProject) => p.clips.map((c) => c.id);

describe("EDL operations", () => {
  it("moves a clip and clamps the target index", () => {
    expect(ids(applyOp(project, { type: "move", clipId: "a", toIndex: 2 }))).toEqual(["b", "c", "a"]);
    expect(ids(applyOp(project, { type: "move", clipId: "c", toIndex: -5 }))).toEqual(["c", "a", "b"]);
  });

  it("only accepts reorders that are permutations", () => {
    expect(ids(applyOp(project, { type: "reorder", clipIds: ["c", "b", "a"] }))).toEqual(["c", "b", "a"]);
    expect(applyOp(project, { type: "reorder", clipIds: ["a", "a", "b"] })).toBe(project);
    expect(applyOp(project, { type: "reorder", clipIds: ["a", "b"] })).toBe(project);
  });

  it("removes and adds clips", () => {
    const removed = applyOp(project, { type: "remove", clipId: "b" });
    expect(ids(removed)).toEqual(["a", "c"]);
    expect(ids(applyOp(removed, { type: "add", clip: clip("b", 0, 1000), index: 0 }))).toEqual(["b", "a", "c"]);
    // Duplicate ids are ignored.
    expect(applyOp(project, { type: "add", clip: clip("a", 0, 1) })).toBe(project);
  });

  it("trims within source bounds and enforces a minimum length", () => {
    const bounds = { b: { minMs: 9000, maxMs: 15_000 } };
    const t = applyOp(project, { type: "trim", clipId: "b", inMs: 5000, outMs: 99_000 }, bounds);
    expect(t.clips[1]).toMatchObject({ inMs: 9000, outMs: 15_000 });

    const tooShort = applyOp(project, { type: "trim", clipId: "b", inMs: 11_800, outMs: 12_000 }, bounds);
    expect(tooShort.clips[1].outMs - tooShort.clips[1].inMs).toBe(MIN_CLIP_MS);
    expect(tooShort.clips[1].outMs).toBe(12_000);
  });

  it("clears empty captions", () => {
    const p = applyOp(project, { type: "setCaption", clipId: "a", caption: "  " });
    expect(p.clips[0].caption).toBeNull();
    expect(applyOp(project, { type: "setCaption", clipId: "a", caption: "GG" }).clips[0].caption).toBe("GG");
  });

  it("computes total duration and locates the playing clip", () => {
    expect(totalDuration(project)).toBe(10_000);
    expect(locate(project, 0)).toMatchObject({ index: 0, offsetMs: 0 });
    expect(locate(project, 6000)).toMatchObject({ index: 1, offsetMs: 1000, clipStartMs: 5000 });
    expect(locate(project, 99_999)).toMatchObject({ index: 2, offsetMs: 3000 });
    expect(locate({ ...project, clips: [] }, 0)).toBeNull();
  });
});

describe("edit history", () => {
  it("undoes and redoes, clearing redo on new edits", () => {
    let h = initHistory(project);
    h = historyReducer(h, { type: "apply", op: { type: "remove", clipId: "a" } });
    h = historyReducer(h, { type: "apply", op: { type: "setAspect", aspect: "9:16" } });
    expect(h.present.aspect).toBe("9:16");

    h = historyReducer(h, { type: "undo" });
    expect(h.present.aspect).toBe("16:9");
    expect(ids(h.present)).toEqual(["b", "c"]);
    h = historyReducer(h, { type: "redo" });
    expect(h.present.aspect).toBe("9:16");

    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "apply", op: { type: "setCaptions", enabled: false } });
    expect(h.future).toHaveLength(0);
  });

  it("coalesces continuous edits into one undo step", () => {
    let h = initHistory(project);
    h = historyReducer(h, { type: "apply", op: { type: "trim", clipId: "a", inMs: 100, outMs: 5000 } });
    h = historyReducer(h, { type: "apply", op: { type: "trim", clipId: "a", inMs: 200, outMs: 5000 }, coalesce: true });
    h = historyReducer(h, { type: "apply", op: { type: "trim", clipId: "a", inMs: 300, outMs: 5000 }, coalesce: true });
    expect(h.past).toHaveLength(1);
    h = historyReducer(h, { type: "undo" });
    expect(h.present.clips[0].inMs).toBe(0);
  });

  it("ignores no-op edits", () => {
    const h = initHistory(project);
    expect(historyReducer(h, { type: "apply", op: { type: "remove", clipId: "zzz" } })).toBe(h);
    expect(historyReducer(h, { type: "undo" })).toBe(h);
  });
});
