import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { ObsCard } from "@/components/sources/obs-card";
import { MedalFolderCard, WatchedFoldersCard } from "@/components/sources/folder-cards";
import { SourceCard } from "@/components/sources/source-card";

export const metadata: Metadata = { title: "Sources" };


export default function SourcesPage() {
  return (
    <PageTransition>
      <PageContainer className="pb-24">
        <PageHeader
          eyebrow="Sources"
          title="Where your clips come from"
          description="METAL records through OBS, picks up clips from folders you choose, or takes videos you import by hand. Everything stays on this computer."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── OBS ───────────────────────────────────── */}
          <ObsCard />

          {/* ── Watched folders ───────────────────────── */}
          <WatchedFoldersCard />

          {/* ── Medal folder ──────────────────────────── */}
          <MedalFolderCard />

          {/* ── Manual import ─────────────────────────── */}
          <SourceCard
            id="manual"
            icon={Upload}
            title="Import videos"
            state="ready"
            description="Drop in MP4, MOV, MKV, or WebM files from anywhere. METAL checks and previews them right away."
            className="lg:col-span-2"
          >
            <div className="flex flex-wrap items-center gap-4">
              <ButtonLink href="/import" variant="secondary">
                <Upload className="size-4" aria-hidden /> Choose videos
              </ButtonLink>
              <p className="text-[12.5px] text-ink-faint">Copied into your library, checked with FFprobe, and ready to watch with a thumbnail.</p>
            </div>
          </SourceCard>
        </div>
      </PageContainer>
    </PageTransition>
  );
}
