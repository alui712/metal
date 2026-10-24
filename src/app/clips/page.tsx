import type { Metadata } from "next";
import { LoaderCircle, Scissors } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RecordingTile } from "@/components/recordings/recording-tile";
import { AutoRefresh } from "@/components/recordings/auto-refresh";
import { AnalyzeButton } from "@/components/smartclip/analyze-button";
import { EmptyState, PageContainer, PageHeader, SectionHeading } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/format";
import { getDb } from "@/server/db/client";
import { readRecordings } from "@/server/recordings";
import { smartClipOverview, topSuggestions } from "@/server/smartclip/actions";

export const metadata: Metadata = { title: "Smart Clip" };

export default function ClipsPage() {
  return (
    <PageTransition>
      <PageContainer className="pb-24">
        <PageHeader
          eyebrow="Smart Clip"
          title="Moments worth keeping"
          description="METAL measures each recording — sudden loudness, sharp picture changes — and suggests clips around what it finds, with the evidence. You decide what to keep."
        />
        <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-surface-2" />}>
          <Overview />
        </Suspense>
      </PageContainer>
    </PageTransition>
  );
}

const CONF = { strong: "Strong signal", moderate: "Moderate signal", weak: "Weak signal" } as const;

async function Overview() {
  await connection();
  const db = getDb();
  const all = readRecordings();
  const byId = new Map(all.map((r) => [r.id, r]));
  const overview = smartClipOverview(db);
  const analyzed = new Map(overview.map((o) => [o.recordingId, o]));
  const top = topSuggestions(db, 9);
  const saved = all.filter((r) => r.origin === "clip");
  const waiting = all.filter((r) => r.origin !== "clip" && (r.status === "ready" || r.status === "analyzed") && !r.mediaMissing && !analyzed.has(r.id));
  const running = overview.filter((o) => o.status === "queued" || o.status === "running");
  const quiet = overview.filter((o) => o.status === "done" && o.open === 0 && byId.has(o.recordingId));

  if (!all.length) {
    return <EmptyState icon={Scissors} title="No recordings yet" description="Record with OBS, watch a folder, or import a video — then Smart Clip can look for moments in it." action={{ href: "/sources", label: "Add a source" }} />;
  }

  return (
    <div className="space-y-14">
      {running.length > 0 && <AutoRefresh />}
      <section aria-labelledby="suggested-heading">
        <SectionHeading id="suggested-heading" title="Suggested clips" />
        {top.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {top.map(({ recordingId, suggestion: s }) => {
              const r = byId.get(recordingId);
              return (
                <li key={s.id}>
                  <Link href={`/recordings/${recordingId}#smart-clip`} className="group block">
                    <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-3 ring-1 ring-line transition-transform duration-500 group-hover:scale-[1.015]">
                      {s.thumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- local keyframe
                        <img src={s.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
                      )}
                      <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
                        {timecode(s.startMs)} · {Math.round((s.endMs - s.startMs) / 1000)} s
                      </span>
                      <span className={cn("absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10.5px] font-medium backdrop-blur", s.confidence === "strong" ? "border-ok/40 bg-black/50 text-ok" : "border-white/20 bg-black/50 text-white/85")}>
                        {CONF[s.confidence]}
                      </span>
                    </div>
                    <p className="mt-3 text-[15px] font-medium text-ink group-hover:text-white">{s.title}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-ink-faint">{r?.title ?? "Recording"} · {s.evidence[0]?.label}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-[13.5px] text-ink-muted">
            {overview.length ? "No open suggestions. Everything has been saved or dismissed — or nothing stood out." : "Nothing analyzed yet. Pick a recording below to find its moments."}
          </p>
        )}
        {running.length > 0 && (
          <p className="mt-4 flex items-center gap-2 text-[13px] text-accent-ink">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Analyzing {running.length} recording{running.length > 1 ? "s" : ""}…
          </p>
        )}
      </section>

      {waiting.length > 0 && (
        <section aria-labelledby="waiting-heading">
          <SectionHeading id="waiting-heading" title="Not analyzed yet" />
          <p className="-mt-2 mb-4 text-[13px] text-ink-faint">Analysis runs on this computer with FFmpeg. Nothing is uploaded.</p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-2/60">
            {waiting.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <Link href={`/recordings/${r.id}`} className="min-w-0 text-[14px] font-medium text-ink hover:text-white">
                  <span className="block truncate">{r.title}</span>
                  <span className="block text-[12px] font-normal text-ink-faint">{r.durationMs ? timecode(r.durationMs) : ""}</span>
                </Link>
                <AnalyzeButton recordingId={r.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {saved.length > 0 && (
        <section aria-labelledby="saved-heading">
          <SectionHeading id="saved-heading" title="Saved clips" />
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {saved.map((r) => (
              <li key={r.id}>
                <RecordingTile recording={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {quiet.length > 0 && (
        <p className="text-[12.5px] text-ink-faint">
          {quiet.length} analyzed recording{quiet.length > 1 ? "s have" : " has"} no open suggestions.
        </p>
      )}
    </div>
  );
}
