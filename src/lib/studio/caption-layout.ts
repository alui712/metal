import type { Aspect } from "@/lib/memory/contracts";

// Shared by the export (src/server/studio/render.ts burns these into the picture)
// and the Studio preview, so both show the same caption box and line breaks.

const FRAME = { "16:9": { width: 1920, height: 1080 }, "9:16": { width: 1080, height: 1920 }, "1:1": { width: 1080, height: 1080 } } as const;

/** Font size as a fraction of the frame's shorter side (50 px at 1080). */
export const CAPTION_FONT = 0.046;
/** Gap between the caption box and the bottom edge, as a fraction of height. */
export const CAPTION_BOTTOM = { "16:9": 0.08, "9:16": 0.14, "1:1": 0.09 } as const;

export const captionFontPx = (aspect: Aspect) => Math.round(Math.min(FRAME[aspect].width, FRAME[aspect].height) * CAPTION_FONT);

/** Average glyph width estimate for bold Helvetica, in ems. */
export const CAPTION_CHAR_EM = 0.56;

/** Word-wraps a caption to ≤ 3 lines that fit 84% of the frame width ("…" when cut). */
export function wrapCaption(text: string, aspect: Aspect): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const fs = captionFontPx(aspect);
  const maxChars = Math.max(8, Math.floor((FRAME[aspect].width * 0.84 - fs * 1.6) / (fs * CAPTION_CHAR_EM)));
  const lines: string[] = [];
  for (const w of words) {
    const last = lines.at(-1);
    if (last !== undefined && (last + " " + w).length <= maxChars) lines[lines.length - 1] = `${last} ${w}`;
    else lines.push(w.length > maxChars ? `${w.slice(0, maxChars - 1)}…` : w);
  }
  if (lines.length > 3) {
    lines.length = 3;
    lines[2] = `${lines[2].slice(0, maxChars - 1).replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}
