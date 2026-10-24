"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Moment, Recording, StoryProject } from "@/lib/memory/contracts";
import { StudioEditor } from "./studio-editor";
import type { ExportView } from "./real-export";
import type { StudioLibrary } from "./types";

type StoryView = {
  project: StoryProject;
  recordings: Record<string, Recording>;
  moments: Record<string, Moment>;
  candidates: Moment[];
  sourceSession: { id: string; title: string } | null;
  removedCount: number;
  issues: Record<string, string>;
  exports: ExportView[];
};

/** Studio on real recordings, seeded from a Time Machine handoff (`?story=`). */
export function RealStudio({ storyId }: { storyId: string }) {
  const [view, setView] = useState<StoryView | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/stories/${encodeURIComponent(storyId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((v: StoryView) => alive && setView(v))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [storyId]);

  if (error)
    return (
      <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
        <p className="text-[15px] font-medium text-ink">This story couldn’t be opened</p>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">It may have been removed. Start a new one from a Time Machine session.</p>
        <Link href="/studio" className="mt-4 inline-block text-[13px] font-medium text-accent-ink hover:text-white">Your stories →</Link>
      </div>
    );
  if (!view) return <div aria-busy="true" aria-label="Loading story" className="h-[460px] animate-pulse rounded-2xl bg-surface-2/70" />;
  const library: StudioLibrary = { source: "library", recordings: view.recordings, moments: view.moments, gameNames: {}, issues: view.issues };
  return (
    <StudioEditor
      initial={view.project}
      library={library}
      candidates={view.candidates}
      sourceSession={view.sourceSession ? { href: `/sessions/${view.sourceSession.id}`, title: view.sourceSession.title } : undefined}
      persist={{ storyId: view.project.id, exports: view.exports, removedCount: view.removedCount }}
    />
  );
}
