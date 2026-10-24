import { ArrowRight, ArrowUpRight, Film, HardDrive } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { HeroSearch } from "@/components/home/hero-search";
import { MomentCard, SessionCard } from "@/components/memory/cards";
import { SceneArt } from "@/components/media/scene-art";
import { DemoBadge } from "@/components/ui/demo-badge";
import { InView, Reveal } from "@/components/ui/motion";
import { ButtonLink, EmptyState, PageContainer, SectionHeading } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { formatDate } from "@/lib/format";
import { getMemoryRepository } from "@/lib/memory/repository";
import { getLibraryStats } from "@/server/library";

const repo = getMemoryRepository();

async function LibraryStatus() {
  const { recordingCount } = await getLibraryStats();
  return (
    <span>
      {recordingCount === 0
        ? "No recordings imported yet — you're exploring demo memories."
        : `${recordingCount} imported recording${recordingCount === 1 ? "" : "s"} · the views below still show demo memories until ingestion is connected.`}
    </span>
  );
}

const WAYS_IN = [
  {
    n: "01",
    href: "/recall",
    title: "Recall",
    body: "Ask in plain language. Jump to the exact second, with the evidence that matched.",
    art: { variant: "arena", hue: 168, seed: 4 } as const,
  },
  {
    n: "02",
    href: "/sessions",
    title: "Time Machine",
    body: "Every night you played, on a timeline. Open one and relive it like a documentary.",
    art: { variant: "peaks", hue: 205, seed: 9 } as const,
  },
  {
    n: "03",
    href: "/studio",
    title: "Story Studio",
    body: "Arrange the best moments, set the format, and shape them into something to share.",
    art: { variant: "city", hue: 312, seed: 2 } as const,
  },
];

export default function Home() {
  const sessions = repo.sessions();
  const latest = sessions[0];

  if (!latest) {
    return (
      <PageTransition>
        <PageContainer>
          <EmptyState
            icon={Film}
            title="Your library is waiting"
            description="Import a few gameplay recordings and METAL will turn them into moments you can search, relive, and cut into stories."
            action={{ href: "/import", label: "Import recordings" }}
          />
        </PageContainer>
      </PageTransition>
    );
  }

  const latestGame = repo.game(latest.gameId);
  const recentMoments = sessions
    .flatMap((s) => repo.momentsForSession(s.id).filter((m) => m.score >= 0.75))
    .slice(0, 10);
  const featured = sessions.slice(0, 3);

  return (
    <PageTransition>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
        <div aria-hidden className="absolute inset-0 -z-10 opacity-90">
          <SceneArt art={latest.art} />
        </div>
        <div aria-hidden className="grain absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-bg via-bg/70 to-bg/10" />
        <div aria-hidden className="scrim-b absolute inset-0 -z-10" />

        <div className="mx-auto flex min-h-[min(88svh,860px)] w-full max-w-7xl flex-col justify-end px-4 pb-14 pt-24 sm:px-8 md:pb-20">
          <Reveal>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-accent-ink">
                Your gaming memory
              </p>
              <DemoBadge />
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <h1
              id="hero-title"
              className="mt-6 max-w-4xl text-[clamp(3rem,8.5vw,7.25rem)] font-semibold leading-[0.9] tracking-[-0.05em] text-ink"
            >
              Every moment
              <br />
              has a{" "}
              <span className="font-display font-normal italic tracking-[-0.02em] text-accent-ink">story.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-ink-muted sm:text-[18px]">
              Search your recordings in plain language, relive whole nights on a timeline, and cut the
              best of it into something worth sharing.
            </p>
          </Reveal>
          <Reveal delay={0.24} className="mt-9">
            <HeroSearch />
          </Reveal>
          <Reveal delay={0.4} className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2.5 text-[13px] text-ink-faint">
              <HardDrive className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <Suspense fallback={<span>Checking your library…</span>}>
                <LibraryStatus />
              </Suspense>
            </p>
            <Link
              href={`/sessions/${latest.id}`}
              className="group inline-flex items-center gap-2 text-[13px] text-ink-muted transition-colors hover:text-ink"
            >
              <span className="text-ink-faint">Latest session</span>
              <span className="font-medium">{latest.title}</span>
              <span className="text-ink-faint">· {latestGame?.name}, {formatDate(latest.startedAt)}</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </Reveal>
        </div>
      </section>

      <PageContainer className="space-y-24 pb-24 md:pt-6">
        {/* ── Recent moments rail ─────────────────────────── */}
        <section aria-labelledby="recent-heading">
          <SectionHeading
            id="recent-heading"
            title="Recent highlights"
            action={
              <Link href="/library" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
                Open library →
              </Link>
            }
          />
          <InView>
            <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
              {recentMoments.map((m) => {
                const rec = repo.recording(m.recordingId)!;
                return (
                  <li key={m.id} className="w-[min(78vw,300px)] shrink-0 snap-start">
                    <MomentCard
                      moment={m}
                      recording={rec}
                      game={repo.game(rec.gameId)}
                      href={`/sessions/${rec.sessionId}?moment=${m.id}`}
                    />
                  </li>
                );
              })}
            </ul>
          </InView>
        </section>

        {/* ── Ways in ─────────────────────────────────────── */}
        <section aria-labelledby="ways-heading">
          <SectionHeading id="ways-heading" title="Three ways in" />
          <ol className="border-t border-line">
            {WAYS_IN.map((w, i) => (
              <li key={w.href}>
                <InView delay={i * 0.06}>
                  <Link
                    href={w.href}
                    className="group grid grid-cols-[auto_1fr_auto] items-center gap-5 border-b border-line py-7 sm:grid-cols-[4rem_1fr_minmax(0,16rem)_auto] sm:gap-8 sm:py-9"
                  >
                    <span className="font-mono text-[13px] text-ink-faint">{w.n}</span>
                    <span>
                      <span className="block text-[clamp(1.75rem,4vw,2.75rem)] font-semibold tracking-[-0.035em] text-ink transition-colors group-hover:text-white">
                        {w.title}
                      </span>
                      <span className="mt-1.5 block max-w-lg text-[15px] leading-relaxed text-ink-muted">{w.body}</span>
                    </span>
                    <span className="relative hidden aspect-[16/9] overflow-hidden rounded-xl opacity-60 ring-1 ring-line transition-all duration-500 group-hover:opacity-100 sm:block">
                      <SceneArt art={w.art} />
                    </span>
                    <ArrowUpRight
                      className="size-6 text-ink-faint transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-ink"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                  </Link>
                </InView>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Featured sessions ───────────────────────────── */}
        <section aria-labelledby="sessions-heading">
          <SectionHeading
            id="sessions-heading"
            title="Featured sessions"
            action={<ButtonLink href="/sessions" variant="ghost" size="sm">Open Time Machine →</ButtonLink>}
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {featured.map((s, i) => (
              <InView key={s.id} delay={i * 0.08} className={i === 0 ? "lg:col-span-2 lg:row-span-2" : undefined}>
                <SessionCard
                  session={s}
                  game={repo.game(s.gameId)}
                  momentCount={repo.momentsForSession(s.id).length}
                  href={`/sessions/${s.id}`}
                  size={i === 0 ? "lg" : "md"}
                  className="h-full"
                />
              </InView>
            ))}
          </div>
        </section>
      </PageContainer>
    </PageTransition>
  );
}
