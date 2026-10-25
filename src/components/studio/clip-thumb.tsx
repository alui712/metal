import { SceneArt } from "@/components/media/scene-art";
import type { Moment, Recording, StoryClip } from "@/lib/memory/contracts";
import type { StudioLibrary } from "./types";

/** A side-by-side clip's second POV: its recording, "missing" if it was deleted, undefined for a single clip. */
export const secondOf = (library: StudioLibrary, clip: StoryClip): Recording | "missing" | undefined =>
  clip.secondary ? ((clip.secondary.recordingId && library.recordings[clip.secondary.recordingId]) || "missing") : undefined;

/**
 * A clip's picture: the real keyframe/poster for library clips, procedural art for demo ones.
 * `second`: a side-by-side clip shows both POVs' posters, split like the export.
 */
export function ClipThumb({ rec, moment, atMs, second }: { rec: Recording; moment?: Moment; atMs: number; second?: Recording | "missing" }) {
  if (second) {
    const poster = (r: Recording) => (r.media.kind === "video" ? r.media.poster : undefined);
    const half = (r: Recording | "missing") => {
      const src = r === "missing" ? undefined : poster(r);
      return (
        <span className="relative block h-full min-w-0 flex-1 overflow-hidden bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element -- local poster */}
          {src ? <img src={src} alt="" className="absolute inset-0 size-full object-cover" /> : r !== "missing" && <SceneArt art={r.art} />}
        </span>
      );
    };
    return (
      <span className="absolute inset-0 flex gap-px bg-black">
        {half(rec)}
        {half(second)}
      </span>
    );
  }
  const src = moment?.thumbUrl ?? (rec.media.kind === "video" ? rec.media.poster : undefined);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- local keyframe / poster
    return <img src={src} alt="" className="absolute inset-0 size-full object-cover" />;
  }
  return <SceneArt art={{ ...rec.art, seed: rec.art.seed + atMs / 1000 }} />;
}
