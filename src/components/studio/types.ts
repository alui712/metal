import type { DataSource, Moment, Recording } from "@/lib/memory/contracts";

/** Lookup data the editor needs alongside the EDL. */
export type StudioLibrary = {
  /** "library": real recordings (video previews); "demo": fixtures (labeled, stills). */
  source: DataSource;
  recordings: Record<string, Recording>;
  moments: Record<string, Moment>;
  gameNames: Record<string, string>;
};

export const ASPECT_SIZE = {
  "16:9": { w: 1920, h: 1080, label: "Landscape" },
  "9:16": { w: 1080, h: 1920, label: "Vertical" },
  "1:1": { w: 1080, h: 1080, label: "Square" },
} as const;
