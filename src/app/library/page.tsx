import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { LibraryBrowser } from "@/components/library/library-browser";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { getMemoryRepository } from "@/lib/memory/repository";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  const repo = getMemoryRepository();
  const recordings = repo.recordings();
  const data = {
    recordings,
    games: repo.games(),
    sessions: repo.sessions(),
    moments: Object.fromEntries(recordings.map((r) => [r.id, repo.momentsForRecording(r.id)])),
  };

  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          eyebrow="Library"
          badge={<DemoBadge />}
          title="Every recording, in one place"
          description="Browse, filter, and open any recording to see its moments."
          actions={
            <ButtonLink href="/import" variant="secondary">
              <Upload className="size-4" aria-hidden />
              Import
            </ButtonLink>
          }
        />
        <LibraryBrowser data={data} />
      </PageContainer>
    </PageTransition>
  );
}
