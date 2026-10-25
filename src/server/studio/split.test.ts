import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../db/client";
import { recordings, storyClips } from "../db/schema";
import { splitWindow } from "@/lib/pov/sync";
import { applyOp, edlKey } from "@/lib/studio/edl";
import { trimBounds } from "@/lib/studio/seed";
import type { StoryProject } from "@/lib/memory/contracts";
import { storyArgs } from "./render";
import { createStory, duplicateStory, saveStory, storyView, type SaveInput } from "./stories";

// Multi-POV side by side → Story Studio → split-screen export (pure parts and storage).

describe("split-screen render arguments", () => {
  const mixed = [
    { file: "/m/a.mp4", inMs: 0, outMs: 2000, hasAudio: true },
    { file: "/m/p.mp4", inMs: 2507, outMs: 7507, hasAudio: true, secondary: { file: "/m/s.mp4", inMs: 0 } },
    { file: "/m/c.mp4", inMs: 1000, outMs: 2000, hasAudio: false },
  ];

  it("cuts the second POV at its aligned in-point for the same length, right after its primary", () => {
    const args = storyArgs(mixed, "/x/o.mp4", { aspect: "16:9", framing: "fill" });
    const inputs = args.flatMap((a, i) => (a === "-i" ? [[args[i - 3], args[i - 1], args[i + 1]]] : []));
    expect(inputs).toEqual([
      ["0.000", "2.000", "/m/a.mp4"],
      ["2.507", "5.000", "/m/p.mp4"],
      ["0.000", "5.000", "/m/s.mp4"],
      ["1.000", "1.000", "/m/c.mp4"],
    ]);
    const graph = args[args.indexOf("-filter_complex") + 1];
    // Single clips keep the full frame; the split clip's halves are 960×1080 each, stacked left|right.
    expect(graph).toContain("[0:v:0]setpts=PTS-STARTPTS,fps=30,scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080");
    expect(graph).toContain("[1:v:0]setpts=PTS-STARTPTS,fps=30,scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080");
    expect(graph).toContain("[2:v:0]setpts=PTS-STARTPTS,fps=30,scale=960:1080:force_original_aspect_ratio=increase,crop=960:1080");
    expect(graph).toContain("[v1l][v1r]hstack=inputs=2[v1]");
    expect(graph).toContain("[3:v:0]setpts"); // the next clip's input index shifts past the second POV
    // Sound is the primary POV's; the second POV's audio is never used.
    expect(graph).toContain("[1:a:0]asetpts");
    expect(graph).not.toContain("[2:a:0]");
    expect(graph).toContain("[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]");
  });

  it("indexes caption overlays and the subtitle track after every video input", () => {
    const args = storyArgs(mixed, "/x/o.mp4", {
      aspect: "16:9",
      framing: "fit",
      subtitles: "/x/o.srt",
      overlays: [{ file: "/x/c1.png", startMs: 2000, endMs: 7000 }],
    });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("scale=960:1080:force_original_aspect_ratio=decrease,pad=960:1080");
    expect(graph).toContain("[vc][4:v]overlay=x=(W-w)/2:y=H-h-86:enable='between(t,2.000,6.999)':format=auto[v]");
    expect(args.join(" ")).toContain("-map 5:s:0 -c:s mov_text");
  });

  it("stacks top/bottom in a vertical story", () => {
    const graph = storyArgs([mixed[1]], "/x/o.mp4", { aspect: "9:16", framing: "fill" }).join(" ");
    expect(graph).toContain("scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960");
    expect(graph).toContain("[v0l][v0r]vstack=inputs=2[v0]");
  });
});

describe("side-by-side window (offsetMs convention)", () => {
  // The real PEAK pair: "peak pov" at −1800 ms, "peak pov 2" at +707 ms on the group timeline.
  const peak = { offsetMs: -1800, durationMs: 20_754 };
  const peak2 = { offsetMs: 707, durationMs: 7983 };
  const opts = { beforeMs: 5000, afterMs: 5000, minMs: 1000 };

  it("clamps to where both have footage and aligns the second POV's own time", () => {
    // secondaryOwn = primaryOwn + primaryOffset − secondaryOffset.
    expect(splitWindow(peak, peak2, 6000, opts)).toEqual({ inMs: 2507, outMs: 10_490, secondaryInMs: 0 });
    expect(splitWindow(peak, peak2, 3000, opts)).toEqual({ inMs: 2507, outMs: 8000, secondaryInMs: 0 });
    // From the other side: the second POV is the primary.
    expect(splitWindow(peak2, peak, 4000, opts)).toEqual({ inMs: 0, outMs: 7983, secondaryInMs: 2507 });
  });

  it("refuses less than the shortest clip of overlap", () => {
    expect(splitWindow({ offsetMs: 0, durationMs: 10_000 }, { offsetMs: 9_500, durationMs: 5000 }, 9_000, opts)).toBeNull();
  });
});

describe("Studio edits keep the pair aligned", () => {
  const project: StoryProject = {
    id: "p",
    title: "t",
    aspect: "16:9",
    captions: true,
    sourceSessionId: null,
    clips: [{ id: "c", recordingId: "rec_a", momentId: null, inMs: 2507, outMs: 10_490, caption: null, secondary: { recordingId: "rec_b", inMs: 0 } }],
  };
  const lookup = { recording: (id: string) => ({ rec_a: { durationMs: 20_754 }, rec_b: { durationMs: 7983 } })[id], moment: () => undefined };

  it("moves the second POV with every trim, inside both recordings", () => {
    const bounds = trimBounds(lookup, project.clips);
    expect(bounds.c).toEqual({ minMs: 2507, maxMs: 10_490 });
    const t = applyOp(project, { type: "trim", clipId: "c", inMs: 4000, outMs: 9000 }, bounds).clips[0];
    expect([t.inMs, t.outMs, t.secondary]).toEqual([4000, 9000, { recordingId: "rec_b", inMs: 1493 }]);
    // Pulling the in-point before the second POV starts stops at its first frame.
    const early = applyOp(project, { type: "trim", clipId: "c", inMs: 0, outMs: 10_490 }, bounds).clips[0];
    expect([early.inMs, early.secondary?.inMs]).toEqual([2507, 0]);
  });

  it("counts the pairing in the export key", () => {
    const single = { ...project, clips: [{ ...project.clips[0], secondary: null }] };
    expect(edlKey(project)).not.toBe(edlKey(single));
    expect(edlKey(single)).toBe(edlKey({ ...single, clips: [{ ...single.clips[0], secondary: undefined }] }));
  });
});

describe("side-by-side stories in storage", () => {
  let db: Db;
  const A = "rec_00000000000000a1";
  const B = "rec_00000000000000b2";
  beforeEach(() => {
    db = openDb(":memory:"); // runs every migration, including 0011_split_clips
    for (const [id, dur] of [[A, 20_754], [B, 7983]] as const)
      db.insert(recordings).values({ id, title: id === A ? "peak pov" : "peak pov 2", originalPath: `${id}/o.mp4`, originalFilename: "x.mp4", status: "ready", durationMs: dur }).run();
  });
  const split = (inMs: number, outMs: number, s: { recordingId: string; inMs: number }) => createStory(db, { sessionId: null, ranges: [{ recordingId: A, inMs, outMs, secondary: s }] });

  it("stores both recordings and the frozen aligned in-point; old clips stay single", () => {
    const r = split(2507, 10_490, { recordingId: B, inMs: 0 });
    if ("error" in r) throw new Error(r.error);
    const row = db.select().from(storyClips).where(eq(storyClips.projectId, r.id)).get()!;
    expect([row.layout, row.recordingId, row.secondaryRecordingId, row.inMs, row.outMs, row.secondaryInMs]).toEqual(["side_by_side", A, B, 2507, 10_490, 0]);
    const v = storyView(db, r.id, new Map())!;
    expect(v.project.clips[0].secondary).toEqual({ recordingId: B, inMs: 0 });
    expect(Object.keys(v.recordings).sort()).toEqual([A, B]);

    const single = createStory(db, { sessionId: null, ranges: [{ recordingId: A, inMs: 0, outMs: 3000 }] });
    if ("error" in single) throw new Error(single.error);
    expect(db.select().from(storyClips).where(eq(storyClips.projectId, single.id)).get()!.layout).toBe("single");
    expect(storyView(db, single.id, new Map())!.project.clips[0].secondary).toBeNull();

    const copy = duplicateStory(db, r.id);
    if ("error" in copy) throw new Error(copy.error);
    expect(storyView(db, copy.id, new Map())!.project.clips[0].secondary).toEqual({ recordingId: B, inMs: 0 });
  });

  it("shifts the second POV when the in-point is clamped into the video", () => {
    const r = split(-500, 4000, { recordingId: B, inMs: 1000 });
    if ("error" in r) throw new Error(r.error);
    expect(db.select().from(storyClips).where(eq(storyClips.projectId, r.id)).get()!.secondaryInMs).toBe(1500);
  });

  it("refuses the same recording twice, a second POV out of range, or one that isn't there", () => {
    expect(split(0, 3000, { recordingId: A, inMs: 0 })).toEqual({ error: "Side by side needs two different recordings." });
    expect(split(2507, 10_490, { recordingId: B, inMs: 100 })).toEqual({ error: "The second POV has no footage for part of this clip." });
    expect(split(0, 3000, { recordingId: "rec_00000000000000ff", inMs: 0 })).toEqual({ error: "The second POV’s recording isn’t available." });
  });

  it("validates saves and keeps a pairing whose second POV was deleted, flagged", () => {
    const r = split(2507, 10_490, { recordingId: B, inMs: 0 });
    if ("error" in r) throw new Error(r.error);
    const save = (secondary: SaveInput["clips"][number]["secondary"], inMs = 2507, outMs = 10_490): ReturnType<typeof saveStory> =>
      saveStory(db, r.id, { title: "t", aspect: "16:9", framing: "fill", captions: true, clips: [{ recordingId: A, suggestionId: null, inMs, outMs, caption: "Both POVs", secondary }] });
    expect(save({ recordingId: B, inMs: 1 })).toEqual({ error: "Clip 1: The second POV has no footage for part of this clip.", status: 400 });
    expect(save({ recordingId: A, inMs: 0 })).toEqual({ error: "Clip 1: Side by side needs two different recordings.", status: 400 });
    expect(save({ recordingId: B, inMs: 1493 }, 4000, 9000)).toHaveProperty("updatedAt");
    expect(storyView(db, r.id, new Map())!.project.clips[0]).toMatchObject({ inMs: 4000, outMs: 9000, caption: "Both POVs", secondary: { recordingId: B, inMs: 1493 } });

    db.delete(recordings).where(eq(recordings.id, B)).run();
    const v = storyView(db, r.id, new Map())!;
    expect(v.project.clips[0].secondary).toEqual({ recordingId: null, inMs: 1493 });
    expect(v.issues[v.project.clips[0].id]).toBeTruthy(); // the exact reason is checked with real files in render.test.ts
    // Autosaving other edits keeps the (flagged) pairing rather than silently dropping a POV.
    expect(save({ recordingId: null, inMs: 1493 }, 4000, 9000)).toHaveProperty("updatedAt");
    expect(db.select().from(storyClips).where(eq(storyClips.projectId, r.id)).get()!.layout).toBe("side_by_side");
  });
});
