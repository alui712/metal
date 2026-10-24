import type { Metadata } from "next";
import { SessionExplorer } from "@/components/sessions/session-explorer";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { getMemoryRepository } from "@/lib/memory/repository";

export const metadata: Metadata = { title: "Time Machine" };

export default function SessionsPage() {
  const repo = getMemoryRepository();
  const sessions = repo.sessions().map((s) => ({
    ...s,
    momentCount: repo.momentsForSession(s.id).length,
    recordingCount: s.recordingIds.length,
  }));

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          eyebrow="Time Machine"
          badge={<DemoBadge />}
          title={
            <>
              Every night you played,{" "}
              <span className="font-display font-normal italic text-accent-ink">in order.</span>
            </>
          }
          description="Recordings grouped into sessions. Pick a night to see how it unfolded — minute by minute, from every perspective."
        />
        <SessionExplorer sessions={sessions} games={repo.games()} />
      </PageContainer>
    </PageTransition>
  );
}
