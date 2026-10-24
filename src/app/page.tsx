import { ArrowUpRight, AudioLines, Clapperboard, History, Laugh, MessageSquareQuote, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CaptureConsole } from "@/components/capture/capture-console";
import { HeroSearch } from "@/components/home/hero-search";
import { MomentCard, RecordingThumb } from "@/components/memory/cards";
import { DemoBadge } from "@/components/ui/demo-badge";
import { InView, Reveal } from "@/components/ui/motion";
import { PageContainer, SectionHeading } from "@/components/ui/page";
import { AutoRefresh } from "@/components/recordings/auto-refresh";
import { RecordingTile } from "@/components/recordings/recording-tile";
import { RecordingsSkeleton } from "@/components/recordings/your-recordings";
import { PageTransition } from "@/components/ui/page-transition";
import { formatDate } from "@/lib/format";
import { getMemoryRepository } from "@/lib/memory/repository";
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

const QUICK = [
  { href: "/recall", title: "Recall", body: "Find any moment by describing it.", icon: Search },
  { href: "/sessions", title: "Time Machine", body: "Relive whole nights on a timeline.", icon: History },
  { href: "/studio", title: "Story Studio", body: "Cut the best moments into a story.", icon: Clapperboard },
];

const SMART_SIGNALS = [
  { icon: Laugh, label: "Laughter and reactions" },
  { icon: AudioLines, label: "Hype and volume peaks" },
  { icon: MessageSquareQuote, label: "Clutch callouts in voice chat" },
];

function SmartClipCard() {
  return (
    <section
      aria-labelledby="smart-clip-heading"
      className="relative isolate overflow-hidden rounded-3xl border border-accent/25 bg-surface-2/70 p-6"
    >
      <div aria-hidden className="absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.2em] text-accent-ink">
        <Sparkles className="size-4" aria-hidden /> AI Smart Clip
      </div>
      <h2 id="smart-clip-heading" className="mt-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.025em] text-ink">
        Let METAL find the clip.
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
        Play without reaching for a hotkey. Smart Clip reviews your recording and saves the moments worth keeping, each with
        the evidence it found.
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
        Arrives in Phase 5. It needs real recordings and on-device analysis — until then it stays off rather than guessing.
      </p>
      <Link
        href="/recall?q=everyone%20laughing"
        className="mt-4 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-accent-ink transition-colors hover:text-white"
      >
        See what found moments look like (demo) <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

export default function Home() {
  const savedMoments = repo.topMoments(10);

  return (
    <PageTransition>
      <PageContainer className="space-y-16 pb-24 md:space-y-20">
        <div className="space-y-8">
          <Reveal>
            <header className="flex flex-col gap-2">
              <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-accent-ink">Capture</p>
              <h1 className="text-[clamp(2.25rem,4.6vw,3.75rem)] font-semibold leading-[1] tracking-[-0.045em] text-ink">
                Every moment has a{" "}
                <span className="font-display font-normal italic tracking-[-0.02em] text-accent-ink">story.</span>
              </h1>
            </header>
          </Reveal>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <Reveal delay={0.06}>
              <CaptureConsole />
            </Reveal>
            <Reveal delay={0.12} className="flex flex-col gap-6">
              <SmartClipCard />
              <nav aria-label="Your memories" className="overflow-hidden rounded-3xl border border-line bg-surface-2/60">
                <ul className="divide-y divide-line">
                  {QUICK.map(({ href, title, body, icon: Icon }) => (
                    <li key={href}>
                      <Link href={href} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-3/60">
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-3 text-accent-ink">
                          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-medium text-ink">{title}</span>
                          <span className="block truncate text-[12.5px] text-ink-faint">{body}</span>
                        </span>
                        <ArrowUpRight className="size-4 text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-ink" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </Reveal>
          </div>
        </div>

        {/* ── Recall ─────────────────────────────────────── */}
        <section aria-labelledby="ask-heading">
          <SectionHeading id="ask-heading" title="Ask your memories" />
          <HeroSearch />
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

        {/* ── Saved moments ──────────────────────────────── */}
        <section aria-labelledby="moments-heading">
          <SectionHeading
            id="moments-heading"
            title="Saved moments"
            action={
              <Link href="/recall" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
                Search all →
              </Link>
            }
          />
          <p className="mb-5 flex flex-wrap items-center gap-3 text-[13px] text-ink-faint">
            <DemoBadge />
            Sample moments — your own appear once analysis arrives (Phase 5).
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
      </PageContainer>
    </PageTransition>
  );
}
