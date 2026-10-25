import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, AudioLines, Columns2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { StepStrip } from "@/components/ui/how-it-works";
import { Reveal } from "@/components/ui/motion";
import { EmptyState, PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { formatDate, plural, timecode } from "@/lib/format";
import type { PovGroupSummary } from "@/lib/pov/types";
import { getDb } from "@/server/db/client";
import { listPovGroups } from "@/server/pov/povs";
import { mediaUrls } from "@/server/timemachine/media-urls";

export const metadata: Metadata = { title: "Multi-POV" };

const METHOD: Record<PovGroupSummary["method"], string> = {
  audio: "Aligned by shared audio",
  clock: "Aligned by recording clocks",
  manual: "Lined up by hand",
  mixed: "Aligned by audio, clocks and hand",
};

export default function PovsPage() {
  return (
    <PageTransition>
      <PageContainer className="pb-24">
        <PageHeader
          eyebrow="Multi-POV"
          title={
            <>
              One moment,{" "}
              <span className="font-display font-normal italic text-accent-ink">every angle.</span>
            </>
          }
          description="Recordings of the same match from different players, lined up on one timeline. Open a group to switch POVs without losing the moment, watch them side by side, and clip both into Story Studio."
        />
        <StepStrip
          label="Multi-POV workflow"
          className="-mt-4 mb-10"
          steps={["Open a group", "Side by side (V)", "Clip both POVs", "Export in Story Studio"]}
        />
        <Suspense fallback={<GroupsSkeleton />}>
          <Groups />
        </Suspense>
      </PageContainer>
    </PageTransition>
  );
}

async function Groups() {
  await connection();
  const groups = listPovGroups(getDb(), mediaUrls());
  if (!groups.length)
    return (
      <EmptyState
        icon={Columns2}
        title="No synced POVs yet"
        description={
          <>
            Import both players’ recordings of a match, open one in the Library and choose <span className="text-ink">Find other POVs</span>. It compares
            recording times, game tags and shared sound; pair the match you recognize, then fine-tune or confirm the sync in the viewer.
          </>
        }
        action={{ href: "/library", label: "Open the Library" }}
      />
    );
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="POV groups">
      {groups.map((g, i) => (
        <li key={g.id} className="min-w-0">
          <Reveal delay={Math.min(i, 6) * 0.05} y={12} className="h-full">
            <GroupCard group={g} />
          </Reveal>
        </li>
      ))}
    </ul>
  );
}

function GroupCard({ group: g }: { group: PovGroupSummary }) {
  const names = g.members.map((m) => m.playerName ?? m.title);
  const shown = g.members.slice(0, 2);
  const games = [...new Set(g.members.map((m) => m.game).filter((x): x is string => !!x))];
  const recordedAt = g.members.map((m) => m.recordedAt).filter((x): x is number => x !== null);
  const facts = [games.join(", "), recordedAt.length ? formatDate(Math.min(...recordedAt)) : null, `${timecode(g.endMs - g.startMs)} timeline`].filter(Boolean);
  return (
    <Link
      href={`/povs/${g.id}`}
      transitionTypes={["nav-forward"]}
      aria-label={`Open Multi-POV: ${names.join(" and ")}`}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface-2 transition-[border-color,transform] duration-500 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-accent/40 focus-visible:border-accent/60 focus-visible:outline-none"
    >
      <span className="relative flex aspect-video overflow-hidden bg-surface-3">
        {shown.map((m, i) => (
          <span key={m.recordingId} className={`relative flex-1 overflow-hidden ${i > 0 ? "border-l-2 border-surface-2" : ""}`}>
            {m.posterUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local poster
              <img src={m.posterUrl} alt="" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
            ) : (
              <Columns2 className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
            )}
            <span className="absolute left-2.5 top-2.5 max-w-[calc(100%-1.25rem)] truncate rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] font-medium text-white backdrop-blur">
              {m.playerName ?? m.title}
            </span>
          </span>
        ))}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          <Columns2 className="size-3" aria-hidden /> {plural(g.members.length, "POV")}
          {g.members.length > shown.length && <span className="text-white/70">· +{g.members.length - shown.length} more</span>}
        </span>
      </span>
      <span className="flex flex-1 flex-col p-4">
        <span className="block truncate text-[15.5px] font-medium text-ink">{names.join(" × ")}</span>
        {facts.length > 0 && <span className="mt-1 block truncate text-[12.5px] text-ink-faint">{facts.join(" · ")}</span>}
        <span className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${g.confirmed ? "border-ok/30 bg-ok/10 text-ok" : "border-warn/30 bg-warn/10 text-warn"}`}>
            {g.confirmed ? "Sync confirmed" : "Sync suggested"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-ink-muted">
            {g.method === "audio" && <AudioLines className="size-3" aria-hidden />}
            {METHOD[g.method]}
          </span>
          <span className="rounded-full border border-line px-2 py-0.5 text-ink-muted">
            {g.sharedMs > 0 ? `All POVs together ${timecode(g.sharedMs)}` : "No shared footage"}
          </span>
        </span>
        <span className={buttonClass("secondary", "sm", "mt-4 self-start group-hover:border-accent/50 group-hover:text-ink")}>
          Open Multi-POV <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </span>
    </Link>
  );
}

function GroupsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading POV groups" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="aspect-[4/3] animate-pulse rounded-3xl bg-surface-2/70" />
      ))}
    </div>
  );
}

