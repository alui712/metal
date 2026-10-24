import { describe, expect, it } from "vitest";
import { getMemoryRepository, SUGGESTED_QUERIES } from "./repository";
import { stem, tokenize } from "./demo/search";

const repo = getMemoryRepository();

describe("demo fixtures integrity", () => {
  it("is labeled as demo data everywhere", () => {
    expect(repo.source).toBe("demo");
    expect(repo.recordings().every((r) => r.source === "demo" && r.media.kind === "demo")).toBe(true);
    expect(repo.sessions().every((s) => s.source === "demo")).toBe(true);
  });

  it("keeps every moment inside its recording", () => {
    for (const r of repo.recordings()) {
      for (const m of repo.momentsForRecording(r.id)) {
        expect(m.startMs).toBeGreaterThanOrEqual(0);
        expect(m.endMs).toBeLessThanOrEqual(r.durationMs);
        expect(m.endMs).toBeGreaterThan(m.startMs);
        for (const line of m.transcript) {
          expect(line.tMs).toBeGreaterThanOrEqual(m.startMs);
          expect(line.tMs).toBeLessThanOrEqual(m.endMs);
        }
      }
    }
  });

  it("links sessions to existing recordings and cover moments", () => {
    for (const s of repo.sessions()) {
      expect(s.recordingIds.length).toBeGreaterThan(0);
      for (const id of s.recordingIds) expect(repo.recording(id)?.sessionId).toBe(s.id);
      const cover = repo.moment(s.coverMomentId);
      expect(cover).toBeDefined();
      expect(s.recordingIds).toContain(cover!.recordingId);
      expect(repo.game(s.gameId)).toBeDefined();
    }
  });

  it("has unique ids", () => {
    const all = [
      ...repo.recordings().map((r) => r.id),
      ...repo.sessions().map((s) => s.id),
      ...repo.topMoments(1000).map((m) => m.id),
    ];
    expect(new Set(all).size).toBe(all.length);
  });

  it("orders sessions newest first and session moments chronologically", () => {
    const starts = repo.sessions().map((s) => s.startedAt);
    expect([...starts].sort((a, b) => b - a)).toEqual(starts);
    const s = repo.sessions()[0];
    const abs = repo
      .momentsForSession(s.id)
      .map((m) => repo.recording(m.recordingId)!.recordedAt + m.startMs);
    expect([...abs].sort((a, b) => a - b)).toEqual(abs);
  });
});

describe("demo keyword search", () => {
  it("stems and drops stop words", () => {
    expect(tokenize("When Mira clutched the 1v3!")).toEqual(["mira", "clutched", "1v3"]);
    expect(stem("clutched")).toBe("clutch");
    expect(stem("laughing")).toBe("laugh");
    expect(stem("running")).toBe("run");
  });

  it("finds the right moment with speech and title evidence", () => {
    const { results, source, method } = repo.search("when Mira clutched the 1v3");
    expect(source).toBe("demo");
    expect(method).toMatch(/keyword/i);
    expect(results[0].moment.id).toBe("mom_s7_clutch");
    expect(results[0].evidence.map((e) => e.kind)).toContain("title");
    expect(results[0].seekMs).toBeGreaterThanOrEqual(results[0].moment.startMs);
  });

  it("returns every suggested query with at least one result", () => {
    for (const q of SUGGESTED_QUERIES) expect(repo.search(q).results.length).toBeGreaterThan(0);
  });

  it("returns nothing for empty or unmatched queries", () => {
    expect(repo.search("   ").results).toEqual([]);
    expect(repo.search("the of and").results).toEqual([]);
    expect(repo.search("xylophone quartet").results).toEqual([]);
  });

  it("applies game and evidence filters", () => {
    const ashfall = repo.search("victory", { gameIds: ["ashfall"] }).results;
    expect(ashfall.length).toBeGreaterThan(0);
    expect(ashfall.every((r) => r.recording.gameId === "ashfall")).toBe(true);

    const speechOnly = repo.search("summit", { evidence: ["speech"] }).results;
    expect(speechOnly.every((r) => r.evidence.some((e) => e.kind === "speech"))).toBe(true);
  });

  it("matches loud moments through audio evidence", () => {
    const loud = repo.search("loud").results;
    expect(loud.length).toBeGreaterThan(0);
    expect(loud.every((r) => r.evidence.some((e) => e.kind === "audio"))).toBe(true);
  });
});
