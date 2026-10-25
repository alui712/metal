import type { Metadata } from "next";
import { ArrowLeft, Clapperboard, Scissors } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { sessionArtName } from "@/components/memory/cards";
import { SceneArt } from "@/components/media/scene-art";
import { FriendStack } from "@/components/sessions/friends";
import { SessionTimeline } from "@/components/sessions/session-timeline";
import { buttonClass } from "@/components/ui/button";
import { DemoBadge, Notice } from "@/components/ui/demo-badge";
import { Reveal } from "@/components/ui/motion";
import { PageTransition } from "@/components/ui/page-transition";
import { duration, formatLongDate, formatTime, plural } from "@/lib/format";
import { getMemoryRepository } from "@/lib/memory/repository";
import { SessionView } from "@/components/timemachine/session-view";
import { getDb } from "@/server/db/client";
import { mediaUrls } from "@/server/timemachine/media-urls";
import { isSessionId, sessionDetail } from "@/server/timemachine/sessions";
import { connection } from "next/server";
import { JudgeOutOfScope } from "@/components/judge/out-of-scope";
import { isJudge, scopeSession } from "@/lib/judge/scope";
import { judgeScope } from "@/server/judge/demo";

const repo = getMemoryRepository();

export function generateStaticParams() {
  return repo.sessions().map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/sessions/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: repo.session(id)?.title ?? "Session" };
}

export default function SessionPage({ params, searchParams }: PageProps<"/sessions/[id]">) {
  // Known sessions prerender in full; an unknown id resolves at request time.
  return (
    <Suspense fallback={<div className="min-h-[min(72svh,720px)] animate-pulse bg-surface-2/40" />}>
      <Session params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Session({ params, searchParams }: Pick<PageProps<"/sessions/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const session = repo.session(id);
  if (!session) return <RealSession id={id} judge={isJudge((await searchParams).judge)} />;

  const game = repo.game(session.gameId);
  const recordings = session.recordingIds.map((rid) => repo.recording(rid)!);
  const moments = repo.momentsForSession(session.id);

  return (
    <PageTransition>
      <article>
        {/* ── Hero ─────────────────────────────────────── */}
        <header className="relative isolate overflow-hidden">
          <ViewTransition name={sessionArtName(session.id)} share="morph" default="none">
            <div aria-hidden className="absolute inset-0 -z-10">
              <SceneArt art={session.art} />
            </div>
          </ViewTransition>
          <div aria-hidden className="grain absolute inset-0 -z-10" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-bg/90 via-bg/40 to-transparent" />
          <div aria-hidden className="scrim-b absolute inset-0 -z-10" />

          <div className="mx-auto flex min-h-[min(72svh,720px)] max-w-7xl flex-col px-4 pb-12 pt-6 sm:px-8 md:pt-8">
            <Link
              href="/sessions"
              transitionTypes={["nav-back"]}
              className="inline-flex w-fit items-center gap-2 rounded-lg py-1 text-[13px] font-medium text-white/70 transition-colors hover:text-white"
            >
              <ArrowLeft className="size-4" aria-hidden /> Time Machine
            </Link>
            <div className="mt-auto max-w-3xl pt-24">
              <Reveal>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-white/65">
                    {game?.name} · {formatLongDate(session.startedAt)}
                  </p>
                  <DemoBadge className="bg-black/40" />
                </div>
              </Reveal>
              <Reveal delay={0.06}>
                <h1 className="mt-4 text-[clamp(2.75rem,7vw,6rem)] font-semibold leading-[0.92] tracking-[-0.05em] text-white">
                  {session.title}
                </h1>
              </Reveal>
              <Reveal delay={0.12}>
                <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-white/75">{session.summary}</p>
              </Reveal>
              <Reveal delay={0.18}>
                <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-white/65">
                  <FriendStack names={["You", ...session.friends]} />
                  <span>
                    {formatTime(session.startedAt)} – {formatTime(session.endedAt)} UTC · {duration(session.endedAt - session.startedAt)}
                  </span>
                  <span>
                    {plural(recordings.length, "recording")} · {plural(moments.length, "moment")}
                  </span>
                </div>
              </Reveal>
              <Reveal delay={0.24} className="mt-8 flex flex-wrap gap-3">
                <Link href={`/sessions/${session.id}/relive`} className={buttonClass("primary", "lg")}>
                  <Clapperboard className="size-5" aria-hidden />
                  Relive this night
                </Link>
                <Link
                  href={`/studio?session=${session.id}`}
                  transitionTypes={["nav-forward"]}
                  className={buttonClass("secondary", "lg", "bg-black/40 backdrop-blur")}
                >
                  <Scissors className="size-5" aria-hidden />
                  Create story
                </Link>
              </Reveal>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-8">
          <Notice className="mb-10">
            This night is a demo fixture: the title, summary, and moments are written samples. With real recordings, they’ll be generated from what was actually said and shown.
          </Notice>
          {/* The timeline reads ?moment= (request data), so it streams in. */}
          <Suspense fallback={<div className="h-[340px] animate-pulse rounded-3xl border border-line bg-surface-2/50" />}>
            <SessionTimeline session={session} recordings={recordings} moments={moments} />
          </Suspense>
        </div>
      </article>
    </PageTransition>
  );
}

/** A session from your own recordings (ids that aren't demo fixtures). */
async function RealSession({ id, judge }: { id: string; judge: boolean }) {
  await connection();
  if (!isSessionId(id)) notFound();
  const db = getDb();
  const full = sessionDetail(db, id, mediaUrls());
  if (!full) notFound();
  let data = full;
  if (judge) {
    // Judge mode: approved recordings and moments only, filtered here on the server.
    const scope = judgeScope(db);
    if (scope.demo.nightId !== id) return <JudgeOutOfScope what="night" href={`/sessions/${id}`} />;
    data = scopeSession(full, scope.allowed, scope.cover);
  }
  return (
    <PageTransition>
      <SessionView key={`${data.summary.id}:${data.summary.title}:${judge}`} data={data} judge={judge} />
    </PageTransition>
  );
}
