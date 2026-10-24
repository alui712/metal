import type { Metadata } from "next";
import { CheckCircle2, ExternalLink, FolderOpen, FolderSearch, Radio, Upload } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { Field, SourceCard, Steps, Unavailable, inputClass } from "@/components/sources/source-card";

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
          <SourceCard
            id="obs"
            icon={Radio}
            title="OBS Studio"
            state="not-connected"
            description="The capture engine. METAL tells OBS when to record and save clips through its built-in WebSocket server — OBS does the recording."
            className="lg:row-span-2"
          >
            <h3 className="mb-3 text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Set up OBS</h3>
            <Steps
              steps={[
                <>
                  Install{" "}
                  <a href="https://obsproject.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-ink underline-offset-4 hover:underline">
                    OBS Studio 28 or newer <ExternalLink className="size-3" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                  .
                </>,
                <>In OBS, open <b className="font-medium text-ink">Tools → WebSocket Server Settings</b> and turn on <b className="font-medium text-ink">Enable WebSocket server</b>.</>,
                <>Keep authentication on and copy the server password.</>,
                <>Under <b className="font-medium text-ink">Settings → Output → Replay Buffer</b>, enable the replay buffer so you can save clips after the fact.</>,
              ]}
            />
            <form aria-labelledby="obs-title" className="mt-7 grid gap-4 rounded-2xl border border-line bg-surface/50 p-4 sm:grid-cols-[1fr_7rem]">
              <Field label="Host" htmlFor="obs-host">
                <input id="obs-host" className={inputClass} defaultValue="127.0.0.1" disabled aria-describedby="obs-unavailable" />
              </Field>
              <Field label="Port" htmlFor="obs-port">
                <input id="obs-port" className={inputClass} defaultValue="4455" inputMode="numeric" disabled aria-describedby="obs-unavailable" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Password" htmlFor="obs-password" hint="The desktop app will keep this in your system keychain — never in the browser.">
                  <input id="obs-password" type="password" className={inputClass} placeholder="From OBS WebSocket settings" autoComplete="off" disabled aria-describedby="obs-unavailable" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-3 sm:col-span-2">
                <Button disabled aria-describedby="obs-unavailable">Connect to OBS</Button>
              </div>
            </form>
            <Unavailable id="obs-unavailable">
              Connecting to OBS arrives in Phase 4, inside the desktop app. Until then METAL can’t start, stop, or save
              recordings — and won’t show anything as recorded.
            </Unavailable>
          </SourceCard>

          {/* ── Watched folders ───────────────────────── */}
          <SourceCard
            id="folders"
            icon={FolderSearch}
            title="Watched folders"
            state="needs-desktop"
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
              Choosing folders needs the desktop app (Phase 2); watching them arrives in Phase 5.
            </Unavailable>
          </SourceCard>

          {/* ── Medal folder ──────────────────────────── */}
          <SourceCard
            id="medal"
            icon={FolderOpen}
            title="Medal recordings folder"
            state="needs-desktop"
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
                Arrives with folder watching (Phase 5). METAL isn’t affiliated with Medal and never modifies Medal’s files.
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
              <p className="text-[12.5px] text-ink-faint">Checking and previewing work today; adding them to your library arrives with ingestion (Phase 3).</p>
            </div>
          </SourceCard>
        </div>
      </PageContainer>
    </PageTransition>
  );
}
