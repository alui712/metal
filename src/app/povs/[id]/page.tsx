import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PovViewer } from "@/components/pov/pov-viewer";
import { PageContainer } from "@/components/ui/page";
import { getDb } from "@/server/db/client";
import { isRecordingId } from "@/server/media/storage";
import { groupView, isPovGroupId } from "@/server/pov/povs";
import { mediaUrls } from "@/server/timemachine/media-urls";
import { JudgeOutOfScope } from "@/components/judge/out-of-scope";
import { isJudge } from "@/lib/judge/scope";
import { judgeScope } from "@/server/judge/demo";

export const metadata: Metadata = { title: "Synced POVs" };

export default function PovPage({ params, searchParams }: PageProps<"/povs/[id]">) {
  return (
    <PageContainer className="pb-24">
      <header className="mb-6">
        <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-accent-ink">Multi-POV</p>
        <h1 className="mt-2 text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.03em] text-ink">Same moment, every angle.</h1>
      </header>
      <Suspense fallback={<div className="aspect-video animate-pulse rounded-2xl bg-surface-2" />}>
        <Viewer params={params} searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function Viewer({ params, searchParams }: Pick<PageProps<"/povs/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isPovGroupId(id)) notFound();
  await connection();
  const db = getDb();
  const group = groupView(db, id, mediaUrls());
  if (!group) notFound();
  if (isJudge(sp.judge)) {
    // Guided demo: only the approved, verified pair, opened on one of its own POVs.
    const pov = judgeScope(db).demo.pov;
    const inPair = typeof sp.rec === "string" && pov?.members.some((m) => m.recordingId === sp.rec);
    if (pov?.groupId !== id || !inPair) return <JudgeOutOfScope what="POV group" href={`/povs/${id}`} />;
  }
  // ?rec=<recording>&t=<ms in that recording>: open on that POV at that moment.
  const rec = typeof sp.rec === "string" && isRecordingId(sp.rec) && group.members.some((m) => m.recordingId === sp.rec) ? sp.rec : undefined;
  const t = Number(sp.t);
  const judge = isJudge(sp.judge);
  return (
    <PovViewer
      initial={group}
      focusId={rec}
      startOwnMs={rec && Number.isFinite(t) && t >= 0 ? t : undefined}
      backHref={judge ? "/showcase" : rec ? `/recordings/${rec}#povs` : "/library"}
      judge={judge}
    />
  );
}
