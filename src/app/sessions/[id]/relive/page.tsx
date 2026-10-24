import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReliveViewer } from "@/components/sessions/relive-viewer";
import { getMemoryRepository } from "@/lib/memory/repository";
import { RelivePlayer } from "@/components/timemachine/relive-player";
import { getDb } from "@/server/db/client";
import { mediaUrls } from "@/server/timemachine/media-urls";
import { isSessionId, sessionDetail } from "@/server/timemachine/sessions";
import { connection } from "next/server";

const repo = getMemoryRepository();

export function generateStaticParams() {
  return repo.sessions().map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/sessions/[id]/relive">): Promise<Metadata> {
  const { id } = await params;
  const session = repo.session(id);
  return { title: session ? `Relive · ${session.title}` : "Relive" };
}

export default function RelivePage({ params, searchParams }: PageProps<"/sessions/[id]/relive">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
      <Relive params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Relive({ params, searchParams }: Pick<PageProps<"/sessions/[id]/relive">, "params" | "searchParams">) {
  const { id } = await params;
  const session = repo.session(id);
  if (!session) return <RealRelive id={id} searchParams={searchParams} />;
  return (
    <ReliveViewer
      session={session}
      game={repo.game(session.gameId)}
      moments={repo.momentsForSession(session.id)}
      recordings={session.recordingIds.map((rid) => repo.recording(rid)!)}
    />
  );
}

/** Real Relive: `?moments=a,b,c` plays just those (still in chronological order); otherwise every moment. */
async function RealRelive({ id, searchParams }: { id: string; searchParams: PageProps<"/sessions/[id]/relive">["searchParams"] }) {
  const pick = (await searchParams).moments;
  await connection();
  if (!isSessionId(id)) notFound();
  const data = sessionDetail(getDb(), id, mediaUrls());
  if (!data) notFound();
  const only = typeof pick === "string" && pick ? new Set(pick.split(",")) : null;
  const moments = only ? data.moments.filter((m) => only.has(m.id)) : data.moments;
  return <RelivePlayer sessionId={id} title={data.summary.title} moments={moments} recordings={data.recordings} />;
}
