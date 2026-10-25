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
/** `judge`: the guided demo; the server returns only approved recordings and candidates. */
export function RealStudio({ storyId, judge = false }: { storyId: string; judge?: boolean }) {
  const [view, setView] = useState<StoryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/stories/${encodeURIComponent(storyId)}${judge ? "?judge=1" : ""}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "It may have been removed."))))
      .then((v: StoryView) => alive && setView(v))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [storyId, judge]);

  if (error)
    return (
      <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
        <p className="text-[15px] font-medium text-ink">This story couldn’t be opened</p>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">{error} Start a new one from a Time Machine session.</p>
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
      sourceSession={view.sourceSession ? { href: `/sessions/${view.sourceSession.id}${judge ? "?judge=1" : ""}`, title: view.sourceSession.title } : undefined}
      persist={{ storyId: view.project.id, exports: view.exports, removedCount: view.removedCount }}
    />
  );
}
