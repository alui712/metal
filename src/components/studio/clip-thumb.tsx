import { SceneArt } from "@/components/media/scene-art";
import type { Moment, Recording } from "@/lib/memory/contracts";

/** A clip's picture: the real keyframe/poster for library clips, procedural art for demo ones. */
export function ClipThumb({ rec, moment, atMs }: { rec: Recording; moment?: Moment; atMs: number }) {
  const src = moment?.thumbUrl ?? (rec.media.kind === "video" ? rec.media.poster : undefined);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- local keyframe / poster
    return <img src={src} alt="" className="absolute inset-0 size-full object-cover" />;
  }
  return <SceneArt art={{ ...rec.art, seed: rec.art.seed + atMs / 1000 }} />;
}
