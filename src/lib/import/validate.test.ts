import { describe, expect, it } from "vitest";
import { MAX_FILES, MAX_FILE_BYTES, partitionFiles, validateFile } from "./validate";

const f = (name: string, size = 1000, type = "video/mp4") => ({ name, size, type });

describe("import validation", () => {
  it("accepts supported video containers regardless of case", () => {
    for (const name of ["a.mp4", "b.MOV", "c.mkv", "d.webm"]) {
      expect(validateFile(f(name, 10, ""))).toEqual({ ok: true });
    }
  });

  it("rejects unsupported, empty, oversized, and mislabeled files with reasons", () => {
    expect(validateFile(f("clip.avi"))).toMatchObject({ ok: false, reason: expect.stringContaining(".avi") });
    expect(validateFile(f("noext"))).toMatchObject({ ok: false });
    expect(validateFile(f("a.mp4", 0))).toMatchObject({ ok: false, reason: "File is empty" });
    expect(validateFile(f("a.mp4", MAX_FILE_BYTES + 1))).toMatchObject({ ok: false });
    expect(validateFile(f("a.mp4", 10, "image/png"))).toMatchObject({ ok: false });
  });

  it("rejects duplicates and enforces the batch limit", () => {
    const { accepted, rejected } = partitionFiles([f("a.mp4"), f("a.mp4"), f("x.txt", 5, "text/plain")], new Set(["b.mp4:1000"]));
    expect(accepted.map((x) => x.name)).toEqual(["a.mp4"]);
    expect(rejected.map((r) => r.reason)).toEqual(["Already added", expect.stringContaining(".txt")]);

    const many = Array.from({ length: MAX_FILES + 2 }, (_, i) => f(`${i}.mp4`));
    const result = partitionFiles(many, new Set());
    expect(result.accepted).toHaveLength(MAX_FILES);
    expect(result.rejected).toHaveLength(2);
  });
});
