import type { Metadata } from "next";
import { SessionExplorer } from "@/components/sessions/session-explorer";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { getMemoryRepository } from "@/lib/memory/repository";

export const metadata: Metadata = { title: "Time Machine · Demo" };

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
          description="Sample sessions built from demo fixtures, to show what Time Machine can become. Your real sessions are on the main Time Machine page."
        />
        <SessionExplorer sessions={sessions} games={repo.games()} />
      </PageContainer>
    </PageTransition>
  );
}
