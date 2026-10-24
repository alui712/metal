// Client-side checks run before anything is imported. Pure so it can be tested.

export const ACCEPTED_EXTENSIONS = ["mp4", "mov", "mkv", "webm"] as const;
export const MAX_FILE_BYTES = 20 * 1024 ** 3; // 20 GB
export const MAX_FILES = 25;

export type FileLike = { name: string; size: number; type: string };

export type Validation =
  | { ok: true }
  | { ok: false; reason: string };

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function validateFile(file: FileLike): Validation {
  const ext = extensionOf(file.name);
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      reason: ext
        ? `.${ext} isn’t a supported video format`
        : "File has no extension — METAL can’t tell what it is",
    };
  }
  if (file.type && !file.type.startsWith("video/") && file.type !== "application/octet-stream") {
    return { ok: false, reason: `Reported as ${file.type}, not a video` };
  }
  if (file.size === 0) return { ok: false, reason: "File is empty" };
  if (file.size > MAX_FILE_BYTES) return { ok: false, reason: "Larger than the 20 GB limit" };
  return { ok: true };
}

export const fileKey = (f: FileLike) => `${f.name}:${f.size}`;

/** Splits a batch into accepted and rejected files, given what's already queued. */
export function partitionFiles<T extends FileLike>(
  incoming: T[],
  existingKeys: Set<string>,
): { accepted: T[]; rejected: Array<{ file: T; reason: string }> } {
  const accepted: T[] = [];
  const rejected: Array<{ file: T; reason: string }> = [];
  const seen = new Set(existingKeys);
  for (const file of incoming) {
    const v = validateFile(file);
    if (!v.ok) rejected.push({ file, reason: v.reason });
    else if (seen.has(fileKey(file))) rejected.push({ file, reason: "Already added" });
    else if (seen.size >= MAX_FILES) rejected.push({ file, reason: `Limit of ${MAX_FILES} files per import` });
    else {
      seen.add(fileKey(file));
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}
