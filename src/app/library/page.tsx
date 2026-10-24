import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { Suspense } from "react";
import { LibraryBrowser } from "@/components/library/library-browser";
import { RecordingsSkeleton, YourRecordings } from "@/components/recordings/your-recordings";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";
import { PageContainer, PageHeader, SectionHeading } from "@/components/ui/page";
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
          title="Every recording, in one place"
          description="Your imported recordings, ready to watch — plus demo memories that show what analysis will add."
          actions={
            <ButtonLink href="/import" variant="secondary">
              <Upload className="size-4" aria-hidden />
              Import
            </ButtonLink>
          }
        />
        <section aria-labelledby="yours-heading" className="mb-16">
          <SectionHeading id="yours-heading" title="Your recordings" />
          <Suspense fallback={<RecordingsSkeleton />}>
            <YourRecordings />
          </Suspense>
        </section>
        <section aria-labelledby="demo-heading">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <h2 id="demo-heading" className="text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">Demo memories</h2>
            <DemoBadge />
            <p className="text-[12.5px] text-ink-faint">Fictional sessions with sample moments, kept separate from your recordings.</p>
          </div>
          <LibraryBrowser data={data} />
        </section>
      </PageContainer>
    </PageTransition>
  );
}
