import type { Metadata } from "next";
import { CheckCircle2, FolderOpen, FolderSearch, Upload } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { ObsCard } from "@/components/sources/obs-card";
import { SourceCard, Unavailable } from "@/components/sources/source-card";

export const metadata: Metadata = { title: "Sources" };

const FOLDER_RULES = [
  "Waits until a file has finished writing before importing it",
  "Skips files it has already seen, even if they were renamed",
  "Read-only: never moves, renames, or deletes your files",
];

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
          <SourceCard
            id="folders"
            icon={FolderSearch}
            title="Watched folders"
            state="coming"
            description="Point METAL at any folder where recordings land — OBS’s output folder, another recorder, or an external drive."
          >
            <div className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-faint">
              No folders watched yet
            </div>
            <ul className="mt-4 space-y-2">
              {FOLDER_RULES.map((r) => (
                <li key={r} className="flex items-start gap-2.5 text-[13px] text-ink-muted">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
            <div className="mt-5">
              <Button variant="secondary" disabled aria-describedby="folders-unavailable">
                <FolderOpen className="size-4" aria-hidden /> Add folder…
              </Button>
            </div>
            <Unavailable id="folders-unavailable">
              Watching folders arrives in Phase 4. METAL’s local worker will watch the folders you add.
            </Unavailable>
          </SourceCard>

          {/* ── Medal folder ──────────────────────────── */}
          <SourceCard
            id="medal"
            icon={FolderOpen}
            title="Medal recordings folder"
            state="coming"
            description={
              <>
                Already clip with Medal? Choose the folder where Medal saves clips on this computer and METAL will index
                them in place. No Medal account, sign-in, or cloud access — METAL only reads the video files.
              </>
            }
          >
            <div className="mt-auto">
              <Button variant="secondary" disabled aria-describedby="medal-unavailable">
                <FolderOpen className="size-4" aria-hidden /> Choose Medal folder…
              </Button>
              <Unavailable id="medal-unavailable">
                Arrives with folder watching (Phase 4). METAL isn’t affiliated with Medal and never modifies Medal’s files.
              </Unavailable>
            </div>
          </SourceCard>

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
