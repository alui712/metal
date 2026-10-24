// Magic-byte check on the first bytes of an upload, before it is stored.
// ffprobe does the real validation; this rejects obvious non-video early.

export type ContainerFamily = "isobmff" | "ebml";

const ISO_BOXES = new Set(["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"]);

export function sniffContainer(head: Uint8Array): ContainerFamily | null {
  if (head.length < 12) return null;
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "ebml";
  const box = String.fromCharCode(head[4], head[5], head[6], head[7]);
  return ISO_BOXES.has(box) ? "isobmff" : null;
}

/** Which container families each accepted extension may contain. */
export const EXPECTED_FAMILY = { mp4: "isobmff", mov: "isobmff", webm: "ebml", mkv: "ebml" } as const;
