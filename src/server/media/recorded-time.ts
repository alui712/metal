// When a recording was made, from the most reliable evidence available.
// Import/upload time is never a recording time: with no evidence the
// answer is "unknown" (null), and the UI says so.

export type RecordedAtSource = "filename" | "metadata" | "capture" | "file-date" | "parent" | "manual";

/** Sources the UI should present as approximate. */
export const APPROXIMATE_SOURCES: ReadonlySet<RecordedAtSource> = new Set(["file-date"]);

const plausible = (ms: number) => Number.isFinite(ms) && ms > Date.UTC(2000, 0, 1) && ms < Date.now() + 86_400_000;

/**
 * Local date-time written into a file name by recorders: OBS
 * ("2026-10-24 00-53-20", "Replay 2026-10-22 21-04-11"), Windows Game Bar /
 * phones ("20261024_005320"), ISO-ish ("2026-10-24T00.53.20").
 * Returns when recording *started*: replay-buffer names mark the save (end).
 */
export function timeFromFilename(name: string, durationMs?: number | null): number | null {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const m =
    /(\d{4})-(\d{2})-(\d{2})[ _T](\d{2})[-.:h](\d{2})[-.:m](\d{2})/.exec(base) ??
    /(?<!\d)(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})(?!\d)/.exec(base);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const t = new Date(y, mo - 1, d, h, mi, s).getTime();
  if (!plausible(t)) return null;
  const isReplay = /^replay[\s_-]/i.test(base);
  return isReplay && durationMs ? t - durationMs : t;
}

/** Picks the recording time by reliability: file name › container metadata › existing (capture / file date). */
export function resolveRecordedAt(input: {
  filename: string;
  durationMs: number | null;
  metadataMs: number | null;
  current: { at: number | null; source: RecordedAtSource | null };
}): { at: number | null; source: RecordedAtSource | null } {
  if (input.current.source === "manual" || input.current.source === "parent") return input.current;
  const fromName = timeFromFilename(input.filename, input.durationMs);
  if (fromName !== null) return { at: fromName, source: "filename" };
  if (input.metadataMs !== null && plausible(input.metadataMs)) return { at: input.metadataMs, source: "metadata" };
  return input.current.at !== null && plausible(input.current.at) ? input.current : { at: null, source: null };
}
