import { readRecordings } from "../recordings";
import type { MediaUrls } from "./sessions";

/** Poster / video URLs (by recording id) as the Library serves them. Next-only (reads via getDb). */
export function mediaUrls(): MediaUrls {
  return new Map(readRecordings().map((r) => [r.id, { posterUrl: r.posterUrl, videoUrl: r.videoUrl }]));
}
