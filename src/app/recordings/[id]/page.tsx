import type { Metadata } from "next";
import { AlertTriangle, ArrowLeft, LoaderCircle, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VideoPlayer } from "@/components/media/demo-player";
import { AutoRefresh } from "@/components/recordings/auto-refresh";
import { RemoveRecordingButton } from "@/components/recordings/remove-button";
import { ButtonLink } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { fileSize, formatLocalDateTime, timecode } from "@/lib/format";
import { STAGE_LABEL, type LibraryRecording } from "@/lib/recordings/types";
import { isRecordingId } from "@/server/media/storage";
import { getRecording } from "@/server/recordings";

export const metadata: Metadata = { title: "Recording" };

export default function RecordingPage({ params }: PageProps<"/recordings/[id]">) {
  return (
    <PageTransition>
      <PageContainer className="pb-24">
        <Link href="/library" className="mb-6 inline-flex items-center gap-2 rounded-lg py-1 text-[13px] font-medium text-ink-muted transition-colors hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Library
        </Link>
        <Suspense fallback={<div className="aspect-video animate-pulse rounded-2xl bg-surface-2" />}>
          <RecordingView params={params} />
        </Suspense>
      </PageContainer>
    </PageTransition>
  );
}

async function RecordingView({ params }: { params: PageProps<"/recordings/[id]">["params"] }) {
  const { id } = await params;
  if (!isRecordingId(id)) notFound();
  const r = await getRecording(id);
  if (!r) notFound();
  const processing = r.status === "imported" || r.status === "processing";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        {processing && <AutoRefresh />}
        <Stage r={r} />
        <h1 className="mt-6 text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.03em] text-ink">{r.title}</h1>
        <p className="mt-2 text-[14px] text-ink-faint">Recorded {formatLocalDateTime(r.recordedAt)}</p>

        <section aria-labelledby="analysis-heading" className="mt-10 rounded-2xl border border-line bg-surface-2/60 p-5">
          <h2 id="analysis-heading" className="flex items-center gap-2 text-[14px] font-medium text-ink">
            <Sparkles className="size-4 text-accent-ink" aria-hidden /> Moments & transcript
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
            Not analyzed yet. Voice transcription, moment detection, and Smart Clip arrive in Phase 5 — METAL won’t show
            moments for this video until they come from the video itself.
          </p>
        </section>
      </div>

      <aside aria-label="Recording details" className="space-y-6">
        <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-2/60 text-[13px]">
          {details(r).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-ink-faint">{k}</dt>
              <dd className="min-w-0 truncate text-right text-ink" title={v}>{v}</dd>
            </div>
          ))}
        </dl>
        <RemoveRecordingButton id={r.id} title={r.title} />
      </aside>
    </div>
  );
}

function Stage({ r }: { r: LibraryRecording }) {
  if (r.videoUrl) return <VideoPlayer src={r.videoUrl} poster={r.posterUrl ?? undefined} title={r.title} />;

  const processing = r.status === "imported" || r.status === "processing";
  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-line">
      {r.posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- local managed storage
        <img src={r.posterUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30" />
      )}
      <div className="relative max-w-md px-6 text-center" role="status">
        {processing ? (
          <>
            <LoaderCircle className="mx-auto size-8 animate-spin text-accent-ink" aria-hidden />
            <p className="mt-4 text-[17px] font-medium text-ink">{STAGE_LABEL[r.stage ?? "queued"] ?? "Processing"}…</p>
            {r.stage === "transcoding" && (
              <div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-surface-4" role="progressbar" aria-valuenow={Math.round(r.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Conversion progress">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(r.progress * 100)}%` }} />
              </div>
            )}
            <p className="mt-3 text-[13px] text-ink-muted">This page updates by itself. If nothing moves, check that the worker is running on the Status page.</p>
          </>
        ) : (
          <>
            <AlertTriangle className="mx-auto size-8 text-danger" aria-hidden />
            <p className="mt-4 text-[17px] font-medium text-ink">{r.mediaMissing ? "The video file is missing" : "This video couldn’t be processed"}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              {r.mediaMissing
                ? "METAL’s copy is no longer in its library folder. Remove this entry and import the video again."
                : (r.error ?? "Something went wrong while processing.")}
            </p>
            <ButtonLink href="/import" variant="secondary" size="sm" className="mt-5">
              <Upload className="size-4" aria-hidden /> Import again
            </ButtonLink>
          </>
        )}
      </div>
    </div>
  );
}

function details(r: LibraryRecording): Array<[string, string]> {
  const out: Array<[string, string]> = [["File", r.originalFilename]];
  if (r.durationMs !== null) out.push(["Duration", timecode(r.durationMs)]);
  if (r.width && r.height) out.push(["Resolution", `${r.width}×${r.height}`]);
  if (r.fps) out.push(["Frame rate", `${r.fps} fps`]);
  if (r.format) out.push(["Format", r.format]);
  if (r.videoCodec) out.push(["Video", r.videoCodec.toUpperCase()]);
  out.push(["Audio", r.audioCodec ? r.audioCodec.toUpperCase() : r.durationMs !== null ? "None" : "—"]);
  if (r.sizeBytes) out.push(["Size", fileSize(r.sizeBytes)]);
  if (r.status === "ready" || r.status === "analyzed") out.push(["Playback", r.proxied ? "Converted copy (H.264)" : "Original file"]);
  out.push(["Imported", formatLocalDateTime(r.importedAt)]);
  return out;
}
