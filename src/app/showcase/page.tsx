import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { FeatureCards } from "@/components/judge/feature-cards";
import { MomentFan, PlayHint } from "@/components/judge/moment-fan";
import { ShowcaseHero } from "@/components/judge/showcase-hero";
import { StartTourButton } from "@/components/judge/start-tour-button";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/motion";
import { duration, plural } from "@/lib/format";
import { spotlight, tourTargets } from "@/server/judge/spotlight";

export const metadata: Metadata = {
  title: "Showcase",
  description: "The game ends. The moment doesn’t. A guided look at METAL on real recordings.",
};

/** Full-bleed entry for judges and first-time visitors; the app chrome hides here (see globals.css). */
export default function ShowcasePage() {
  return (
    <div data-immersive className="showcase-stage grain relative isolate min-h-dvh overflow-hidden">
      <div aria-hidden className="showcase-grid pointer-events-none absolute inset-0 -z-10" />

      <header className="mx-auto flex max-w-[110rem] items-center justify-end gap-3 px-5 pt-5 sm:px-10 sm:pt-8 xl:px-16">
        <p className="hidden items-center gap-2 text-[13px] text-ink-muted sm:flex">
          <ShieldCheck className="size-4 text-accent-ink" aria-hidden />
          Runs on this computer. Nothing is uploaded.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-2/60 px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-accent/50 hover:bg-surface-3"
        >
          Enter METAL <ArrowRight className="size-4" aria-hidden />
        </Link>
      </header>

      <section className="mx-auto grid max-w-[110rem] grid-cols-[minmax(0,1fr)] items-center gap-12 px-5 pb-10 pt-10 sm:px-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:pt-14 xl:px-16">
        <div>
          <ShowcaseHero />
          <Reveal delay={0.9}>
            <p className="mt-8 max-w-xl text-[17px] leading-relaxed text-ink-muted sm:text-[18px]">
              METAL records your nights, finds the moments worth keeping, and lets you search, relive and recut them,
              all on your own computer.
            </p>
          </Reveal>
          <Reveal delay={1.0}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Suspense fallback={<span className="inline-block h-13 w-56 animate-pulse rounded-xl bg-accent/30" />}>
                <StartTour />
              </Suspense>
              <ButtonLink href="/" variant="secondary" size="lg">
                Enter METAL
              </ButtonLink>
            </div>
            <p className="mt-4 text-[13px] text-ink-faint">Four stops, about two minutes. A guide follows you across the app.</p>
          </Reveal>
        </div>

        <Suspense fallback={<div className="hidden aspect-[1.08] w-full animate-pulse rounded-3xl bg-surface-2/40 lg:block" />}>
          <Featured />
        </Suspense>
      </section>

      <section aria-labelledby="ways-heading" className="mx-auto max-w-[110rem] px-5 pb-16 sm:px-10 xl:px-16">
        <Reveal delay={1.1}>
          <h2 id="ways-heading" className="mb-5 text-[13px] font-medium uppercase tracking-[0.2em] text-ink-faint">
            Four ways back to a moment
          </h2>
        </Reveal>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-3xl bg-surface-2/40" />}>
          <Features />
        </Suspense>
      </section>
    </div>
  );
}

async function StartTour() {
  await connection();
  return <StartTourButton targets={tourTargets(spotlight())} />;
}

async function Featured() {
  await connection();
  const { night, reels } = spotlight();
  if (!night || !reels.length) {
    return (
      <div className="rounded-3xl border border-line bg-surface-2/60 p-10 text-center">
        <p className="text-[18px] font-semibold text-ink">Your moments will appear here.</p>
        <p className="mt-2 text-[14px] text-ink-muted">Import gameplay and run Find moments to fill this space with real clips.</p>
        <ButtonLink href="/import" className="mt-6">
          Import recordings
        </ButtonLink>
      </div>
    );
  }
  return (
    <div>
      <MomentFan
        cards={reels.slice(0, 3).map((r) => ({
          id: r.recordingId,
          href: `/recordings/${r.recordingId}`,
          imageUrl: r.posterUrl,
          videoUrl: r.videoUrl,
          startMs: 0,
          title: r.title ?? `Recording from ${night.title}`,
          detail: r.durationMs ? duration(r.durationMs) : "",
          label: `Play ${r.title ?? "recording"} from ${night.title}`,
        }))}
      />
      <Reveal delay={1.2}>
        <p className="mt-6 text-[13px] text-ink-faint lg:mt-2 lg:text-right">
          Real footage from <span className="font-medium text-ink-muted">{night.title}</span>: {plural(night.recordingCount, "recording")},{" "}
          {duration(night.footageMs)} of footage. <PlayHint />
        </p>
      </Reveal>
    </div>
  );
}

async function Features() {
  await connection();
  return <FeatureCards spotlight={spotlight()} />;
}
