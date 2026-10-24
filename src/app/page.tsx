import { ArrowUpRight, AudioLines, Mic, ScanLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CaptureConsole } from "@/components/capture/capture-console";
import { HeroSearch } from "@/components/home/hero-search";
import { FeatureCards } from "@/components/judge/feature-cards";
import { NightSpotlight } from "@/components/judge/night-spotlight";
import { StartTourButton } from "@/components/judge/start-tour-button";
import { MomentCard, RecordingThumb } from "@/components/memory/cards";
import { DemoBadge } from "@/components/ui/demo-badge";
import { InView, Reveal } from "@/components/ui/motion";
import { ButtonLink, PageContainer, SectionHeading } from "@/components/ui/page";
import { AutoRefresh } from "@/components/recordings/auto-refresh";
import { RecordingTile } from "@/components/recordings/recording-tile";
import { RecordingsSkeleton } from "@/components/recordings/your-recordings";
import { PageTransition } from "@/components/ui/page-transition";
import { formatDate } from "@/lib/format";
import { getMemoryRepository } from "@/lib/memory/repository";
import { spotlight, tourTargets } from "@/server/judge/spotlight";
import { listRecordings } from "@/server/recordings";

const repo = getMemoryRepository();

/** Real recordings when there are any; otherwise clearly labeled demo ones. */
async function RecentRecordings() {
  const real = await listRecordings();
  if (real.length) {
    return (
      <>
        {real.some((r) => r.status === "imported" || r.status === "processing") && <AutoRefresh />}
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {real.slice(0, 4).map((r) => (
            <li key={r.id}>
              <RecordingTile recording={r} />
            </li>
          ))}
        </ul>
      </>
    );
  }
  const demo = [...repo.recordings()].sort((a, b) => b.recordedAt - a.recordedAt).slice(0, 4);
  return (
    <>
      <p className="mb-5 flex flex-wrap items-center gap-3 text-[13px] text-ink-faint">
        <DemoBadge />
        Nothing imported yet — these are demo recordings.{" "}
        <Link href="/import" className="font-medium text-accent-ink hover:text-white">
          Import your own →
        </Link>
      </p>
      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {demo.map((r, i) => (
          <li key={r.id}>
            <InView delay={i * 0.05}>
              <Link href={r.sessionId ? `/sessions/${r.sessionId}` : "/library"} className="group block">
                <RecordingThumb recording={r} className="transition-transform duration-500 group-hover:scale-[1.015]" />
                <p className="mt-3 truncate text-[14px] font-medium text-ink">{r.title}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-ink-faint">
                  {repo.game(r.gameId)?.name} · {formatDate(r.recordedAt)} · {r.ownerLabel === "You" ? "Your POV" : `${r.ownerLabel}’s POV`}
                </p>
              </Link>
            </InView>
          </li>
        ))}
      </ul>
    </>
  );
}

const SMART_SIGNALS = [
  { icon: AudioLines, label: "Sudden loudness spikes" },
  { icon: ScanLine, label: "Sharp picture changes" },
  { icon: Mic, label: "What was said, as evidence" },
];

function SmartClipCard() {
  return (
    <section
      aria-labelledby="smart-clip-heading"
      className="relative isolate overflow-hidden rounded-3xl border border-accent/25 bg-surface-2/70 p-6"
    >
      <div aria-hidden className="absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.2em] text-accent-ink">
        <Sparkles className="size-4" aria-hidden /> Smart Clip
      </div>
      <h2 id="smart-clip-heading" className="mt-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.025em] text-ink">
        Let METAL find the clip.
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
        Play without reaching for a hotkey. Smart Clip measures your recording and suggests moments worth keeping, each with
        the evidence it found. You preview and decide.
      </p>
      <ul className="mt-5 space-y-2.5">
        {SMART_SIGNALS.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-3 text-[13.5px] text-ink-muted">
            <Icon className="size-4 text-accent-ink" strokeWidth={1.75} aria-hidden />
            {label}
          </li>
        ))}
      </ul>
      <p className="mt-5 rounded-xl border border-line bg-surface/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-faint">
        Measured on this computer with FFmpeg — signals, not scene understanding. METAL never guesses what a sound or
        frame was.
      </p>
      <Link
        href="/clips"
        className="mt-4 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-accent-ink transition-colors hover:text-white"
      >
        See suggested clips <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

/** Labeled demo moments, only when the library has no real night to feature yet. */
function DemoMoments() {
  const savedMoments = repo.topMoments(10);
  return (
    <section aria-labelledby="moments-heading">
      <SectionHeading id="moments-heading" title="Sample moments" />
      <p className="mb-5 flex flex-wrap items-center gap-3 text-[13px] text-ink-faint">
        <DemoBadge />
        Demo moments. Yours appear here once a recording has been through Find moments.
      </p>
      <InView>
        <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
          {savedMoments.map((m) => {
            const rec = repo.recording(m.recordingId)!;
            return (
              <li key={m.id} className="w-[min(78vw,300px)] shrink-0 snap-start">
                <MomentCard moment={m} recording={rec} game={repo.game(rec.gameId)} href={`/sessions/${rec.sessionId}?moment=${m.id}`} />
              </li>
            );
          })}
        </ul>
      </InView>
    </section>
  );
}

async function HeaderActions() {
  await connection();
  return (
    <>
      <StartTourButton targets={tourTargets(spotlight())} size="md" />
      <ButtonLink href="/showcase" variant="secondary">
        <Sparkles className="size-4" aria-hidden /> Showcase
      </ButtonLink>
    </>
  );
}

async function Spotlit() {
  await connection();
  const s = spotlight();
  const cover = s.reels[0]?.posterUrl;
  return (
    <>
      {s.night ? <NightSpotlight night={cover ? { ...s.night, coverUrl: cover } : s.night} moments={s.moments} /> : <DemoMoments />}
      <section aria-labelledby="features-heading">
        <SectionHeading id="features-heading" title="Jump into a feature" />
        <FeatureCards spotlight={s} />
      </section>
    </>
  );
}

export default function Home() {
  return (
    <PageTransition>
      <PageContainer className="space-y-14 pb-24 md:space-y-16">
        <Reveal>
          <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-2">
              <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-accent-ink">METAL</p>
              <h1 className="text-[clamp(2.25rem,4.6vw,3.75rem)] font-semibold leading-[1] tracking-[-0.045em] text-ink">
                Every moment has a{" "}
                <span className="font-display font-normal italic tracking-[-0.02em] text-accent-ink">story.</span>
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <Suspense fallback={<span className="inline-block h-11 w-64 animate-pulse rounded-xl bg-surface-3" />}>
                <HeaderActions />
              </Suspense>
            </div>
          </header>
        </Reveal>

        <Suspense fallback={<div className="h-[22rem] animate-pulse rounded-[2rem] bg-surface-2/60" />}>
          <Spotlit />
        </Suspense>

        {/* ── Capture ────────────────────────────────────── */}
        <section aria-labelledby="capture-heading">
          <SectionHeading id="capture-heading" title="Capture" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <CaptureConsole />
            <SmartClipCard />
          </div>
        </section>

        {/* ── Recall ─────────────────────────────────────── */}
        <section aria-labelledby="ask-heading">
          <SectionHeading id="ask-heading" title="Ask your memories" />
          <Suspense fallback={<HeroSearch />}>
            <AskMemories />
          </Suspense>
        </section>

        {/* ── Recent recordings ──────────────────────────── */}
        <section aria-labelledby="recent-heading">
          <SectionHeading
            id="recent-heading"
            title="Recent recordings"
            action={
              <Link href="/library" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
                Open library →
              </Link>
            }
          />
          <Suspense fallback={<RecordingsSkeleton />}>
            <RecentRecordings />
          </Suspense>
        </section>
      </PageContainer>
    </PageTransition>
  );
}

async function AskMemories() {
  await connection();
  const line = spotlight().recall?.line;
  return <HeroSearch examples={{ real: line ? [line] : [] }} />;
}
