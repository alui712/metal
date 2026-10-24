import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ReliveViewer } from "@/components/sessions/relive-viewer";
import { getMemoryRepository } from "@/lib/memory/repository";

const repo = getMemoryRepository();

export function generateStaticParams() {
  return repo.sessions().map((s) => ({ id: s.id }));
}

export async function generateMetadata({ params }: PageProps<"/sessions/[id]/relive">): Promise<Metadata> {
  const { id } = await params;
  const session = repo.session(id);
  return { title: session ? `Relive · ${session.title}` : "Relive" };
}

export default function RelivePage({ params }: PageProps<"/sessions/[id]/relive">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-black" />}>
      <Relive params={params} />
    </Suspense>
  );
}

async function Relive({ params }: { params: PageProps<"/sessions/[id]/relive">["params"] }) {
  const { id } = await params;
  const session = repo.session(id);
  if (!session) notFound();
  return (
    <ReliveViewer
      session={session}
      game={repo.game(session.gameId)}
      moments={repo.momentsForSession(session.id)}
      recordings={session.recordingIds.map((rid) => repo.recording(rid)!)}
    />
  );
}
