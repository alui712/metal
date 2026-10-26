import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, ViewTransition } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { FeatureCards } from "@/components/judge/feature-cards";
import { MomentFan, PlayHint } from "@/components/judge/moment-fan";
import { ShowcaseHero } from "@/components/judge/showcase-hero";
import { IntroControls, IntroFilm, IntroGate, type IntroVideo } from "@/components/judge/showcase-intro";
import { StartTourButton } from "@/components/judge/start-tour-button";
import { ButtonLink } from "@/components/ui/button";
import { Reveal } from "@/components/ui/motion";
import { duration, plural } from "@/lib/format";
import { spotlight, tourTargets } from "@/server/judge/spotlight";
import { isFixtureDemo } from "@/server/public-demo";

export const metadata: Metadata = {
  title: "Showcase",
  description: "The game ends. The moment doesn’t. A guided look at METAL on real recordings.",
};

/** Full-bleed entry for judges and first-time visitors; the app chrome hides here (see globals.css). */
export default function ShowcasePage() {
  return (
    // Leaving for the app ("portal" navigations) pushes the camera into the stage; see globals.css.
    <ViewTransition exit={{ portal: "portal-out", dive: "dive-out", "card-dive": "dive-out", default: "none" }} default="none">
      <div data-immersive className="showcase-stage grain relative isolate min-h-dvh overflow-hidden">
        <div aria-hidden className="showcase-grid pointer-events-none absolute inset-0 -z-10" />
        <Suspense fallback={null}>
          <Film />
        </Suspense>

        <header data-dive-copy className="mx-auto flex max-w-[110rem] items-center justify-end gap-3 px-5 pt-5 sm:px-10 sm:pt-8 xl:px-16">
          <Suspense fallback={null}>
            <FilmControls />
          </Suspense>
          <p className="ml-auto hidden items-center gap-2 text-[13px] text-ink-muted sm:flex">
            <ShieldCheck className="size-4 text-accent-ink" aria-hidden />
            {isFixtureDemo() ? "Online demo with fictional data. METAL itself runs on your computer." : "Runs on this computer. Nothing is uploaded."}
          </p>
          <Link
            href="/"
            transitionTypes={["portal"]}
            className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-2/60 px-4 py-2 text-[13px] font-medium text-ink backdrop-blur transition-[border-color,background-color,transform] duration-200 hover:border-accent/50 hover:bg-surface-3 active:scale-[0.97]"
          >
            Enter METAL <ArrowRight className="size-4" aria-hidden />
          </Link>
        </header>

        {/* Memory Dive light: a sweep, then a violet wash over the frame (globals.css). */}
        <div aria-hidden className="dive-fx" />

        <section className="mx-auto grid max-w-[110rem] grid-cols-[minmax(0,1fr)] items-center gap-12 px-5 pb-10 pt-10 sm:px-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:pt-14 xl:px-16">
          <div>
            <ShowcaseHero />
            <Reveal delay={0.55}>
              <p data-dive-recede className="mt-8 max-w-xl text-[17px] leading-relaxed text-ink-muted sm:text-[18px]">
                METAL records your nights, finds the moments worth keeping, and lets you search, relive and recut them,
                all on your own computer.
              </p>
            </Reveal>
            {/* The calls to action arrive with the headline: the film never makes anyone wait. */}
            <Reveal delay={0.6}>
              <div data-dive-recede data-dive-cta className="mt-9 flex flex-wrap items-center gap-3">
                <Suspense fallback={<span className="inline-block h-13 w-56 animate-pulse rounded-xl bg-accent/30" />}>
                  <StartTour />
                </Suspense>
                <ButtonLink href="/" variant="secondary" size="lg" transitionTypes={["portal"]}>
                  Enter METAL
                </ButtonLink>
              </div>
              <p data-dive-recede className="mt-4 text-[13px] text-ink-faint">Four stops, about two minutes. A guide follows you across the app.</p>
            </Reveal>
          </div>

          <div data-dive-cards>
            <IntroGate>
              <Suspense fallback={<div className="h-[18.75rem] w-full animate-pulse rounded-3xl bg-surface-2/40 sm:h-[20.75rem] lg:mb-7 lg:aspect-[1.08] lg:h-auto" />}>
                <Featured />
              </Suspense>
            </IntroGate>
          </div>
        </section>

        <section data-dive-copy aria-labelledby="ways-heading" className="mx-auto max-w-[110rem] px-5 pb-16 sm:px-10 xl:px-16">
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
    </ViewTransition>
  );
}

/** Every approved recording's poster, in the approved order: the reel (and the montage's fallback). */
async function introShots() {
  await connection();
  const { night, reels } = spotlight();
  return reels.map((r) => ({ id: r.recordingId, imageUrl: r.posterUrl, caption: r.title ?? night?.title ?? "approved recording" }));
}

/**
 * The approved silent montage, if one was supplied: public/showcase/intro.mp4
 * (+ optional intro.jpg poster), kept out of Git like all media.
 */
function introVideo(): IntroVideo | null {
  const dir = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "showcase");
  if (!fs.existsSync(path.join(dir, "intro.mp4"))) return null;
  return { src: "/showcase/intro.mp4", poster: fs.existsSync(path.join(dir, "intro.jpg")) ? "/showcase/intro.jpg" : null };
}

async function Film() {
  const shots = await introShots();
  return <IntroFilm shots={shots} video={introVideo()} introCount={Math.min(3, shots.length)} />;
}

async function FilmControls() {
  const shots = await introShots();
  return shots.length || introVideo() ? <IntroControls /> : null;
}

async function StartTour() {
  await connection();
  return <StartTourButton targets={tourTargets(spotlight())} dive />;
}

async function Featured() {
  await connection();
  if (isFixtureDemo()) return <SyntheticFan />;
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

/** Fixture demo: the two synthetic Multi-POV clips (scripts/public-demo/make-pov-demo.mts), never real footage. */
function SyntheticFan() {
  const clip = (name: "you" | "kai", title: string) => ({
    id: `demo-${name}`,
    href: "/povs/demo",
    imageUrl: `/demo/pov/${name}.jpg`,
    videoUrl: `/demo/pov/${name}.mp4`,
    startMs: 0,
    title,
    detail: "synthetic clip",
    label: `Play the synthetic ${title} clip`,
  });
  return (
    <div>
      <MomentFan cards={[clip("you", "Sector 7 · your POV"), clip("kai", "Sector 7 · Kai’s POV")]} />
      <Reveal delay={1.2}>
        <p className="mt-6 text-[13px] text-ink-faint lg:mt-2 lg:text-right">
          Synthetic clips generated for this online demo, not real gameplay. <PlayHint />
        </p>
      </Reveal>
    </div>
  );
}

async function Features() {
  await connection();
  return <FeatureCards spotlight={spotlight()} />;
}
