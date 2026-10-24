import { AlertTriangle, FileVideo, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { STAGE_LABEL, type LibraryRecording } from "@/lib/recordings/types";
import { cn } from "@/lib/cn";
import { formatLocalDateTime, timecode } from "@/lib/format";

/** Poster card for a real recording, with honest processing/failure states. */
export function RecordingTile({ recording: r, className }: { recording: LibraryRecording; className?: string }) {
  const processing = r.status === "imported" || r.status === "processing";
  const failed = r.status === "failed" || r.mediaMissing;
  return (
    <Link href={`/recordings/${r.id}`} className={cn("group block", className)}>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-3 ring-1 ring-line transition-transform duration-500 group-hover:scale-[1.015]">
        {r.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from local managed storage
          <img src={r.posterUrl} alt="" loading="lazy" className={cn("size-full object-cover", (processing || failed) && "opacity-40")} />
        ) : (
          <span className="grid size-full place-items-center">
            <FileVideo className="size-7 text-ink-faint" strokeWidth={1.5} aria-hidden />
          </span>
        )}
        {processing && (
          <span className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg bg-black/65 px-2.5 py-1.5 text-[11.5px] font-medium text-white backdrop-blur">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            {STAGE_LABEL[r.stage ?? "queued"] ?? "Processing"}
            {r.stage === "transcoding" && ` · ${Math.round(r.progress * 100)}%`}
          </span>
        )}
        {failed && (
          <span className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg bg-black/70 px-2.5 py-1.5 text-[11.5px] font-medium text-danger backdrop-blur">
            <AlertTriangle className="size-3.5" aria-hidden />
            {r.mediaMissing ? "Video file missing" : "Couldn’t process"}
          </span>
        )}
        {!processing && !failed && r.durationMs !== null && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white/90">
            {timecode(r.durationMs)}
          </span>
        )}
      </div>
      <p className="mt-3 truncate text-[14px] font-medium text-ink">{r.title}</p>
      <p className="mt-0.5 truncate text-[12.5px] text-ink-faint">
        {formatLocalDateTime(r.recordedAt)}
        {r.height ? ` · ${r.height}p` : ""}
        {r.format ? ` · ${r.format}` : ""}
      </p>
    </Link>
  );
}
