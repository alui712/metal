import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { Suspense } from "react";
import { LibraryBrowser } from "@/components/library/library-browser";
import { RecordingsSkeleton, YourRecordings } from "@/components/recordings/your-recordings";
import { ButtonLink } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/demo-badge";
import { HowItWorks } from "@/components/ui/how-it-works";
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
          description="Import a recording, then open it to watch, find moments, or transcribe what was said."
          actions={
            <ButtonLink href="/import">
              <Upload className="size-4" aria-hidden />
              Import recordings
            </ButtonLink>
          }
        />
        <section aria-labelledby="yours-heading" className="mb-16">
          <SectionHeading id="yours-heading" title="Your recordings" />
          <HowItWorks
            summary="What you can do with a recording"
            className="-mt-2 mb-5"
            steps={[
              <><span className="text-ink">Import</span> a video, or let OBS and watched folders add them. Click any recording to open it and watch.</>,
              <><span className="text-ink">Find moments</span> (Smart Clip) measures audio loudness and picture changes and suggests clips you can preview, adjust and save.</>,
              <><span className="text-ink">Transcribe speech</span> turns what was said into timestamped text, so you can search it in Recall.</>,
              <><span className="text-ink">Other POVs</span> finds a teammate’s recording of the same match — both recordings need to be in your library.</>,
              <><span className="text-ink">Send to Story Studio</span> from a suggested clip, a Recall result, or a Time Machine session to build a montage.</>,
            ]}
            note="Watching never runs analysis. Finding moments and transcribing are separate, run only when you ask, and stay on this computer."
          />
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
