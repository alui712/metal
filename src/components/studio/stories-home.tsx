"use client";

import { motion, useReducedMotion } from "motion/react";
import { Clapperboard, Film, LoaderCircle, Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { EASE_OUT } from "@/components/ui/motion";
import { timecode } from "@/lib/format";
import type { ExportView } from "./real-export";

type Story = { id: string; title: string; aspect: string; clipCount: number; durationMs: number; updatedAt: number; coverUrl: string | null; lastExport: ExportView | null };

const updatedFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Saved stories on your recordings; new ones start in Time Machine or Recall. */
export function StoriesHome() {
  const reduce = useReducedMotion();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/stories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { stories: Story[] }) => alive && setStories(j.stories))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-[-0.03em] text-ink">
            Your stories, <span className="font-display font-normal italic text-accent-ink">cut together.</span>
          </h1>
          <p className="mt-2 max-w-xl text-[14.5px] text-ink-muted">Pick moments in Time Machine or Recall, arrange them here, and render a real MP4 from your recordings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sessions" className={buttonClass("primary", "md")}>
            <Clapperboard className="size-4" aria-hidden /> Start from Time Machine
          </Link>
          <Link href="/studio?demo=1" className={buttonClass("ghost", "md")}>
            Try the demo editor
          </Link>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-10 text-[14px] text-danger">Couldn’t load your stories.</p>
      ) : !stories ? (
        <div aria-busy="true" aria-label="Loading stories" className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-3xl bg-surface-2/70" />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-line-strong px-6 py-14 text-center">
          <Film className="mx-auto size-7 text-accent-ink" strokeWidth={1.5} aria-hidden />
          <p className="mt-4 text-[16px] font-medium text-ink">No stories yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-ink-muted">
            Open a session in Time Machine, select moments, and choose “Send to Story Studio” — or start one from a Recall result.
          </p>
        </div>
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Stories">
          {stories.map((s, i) => (
            <motion.li key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={reduce ? { duration: 0.2, y: { duration: 0 } } : { duration: 0.45, delay: Math.min(i, 6) * 0.05, ease: EASE_OUT }}>
              <Link href={`/studio?story=${s.id}`} className="group block overflow-hidden rounded-3xl border border-line bg-surface-2 transition-[border-color,transform] duration-500 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:border-accent/40">
                <span className="relative block aspect-video overflow-hidden bg-surface-3">
                  {s.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local poster
                    <img src={s.coverUrl} alt="" className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                  ) : (
                    <Film className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
                  )}
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                    {s.lastExport?.status === "done" ? (
                      <>
                        <Play className="size-3 fill-current" aria-hidden /> Exported
                      </>
                    ) : s.lastExport?.status === "queued" || s.lastExport?.status === "rendering" ? (
                      <>
                        <LoaderCircle className="size-3 animate-spin" aria-hidden /> Rendering
                      </>
                    ) : s.lastExport?.status === "failed" ? (
                      "Export failed"
                    ) : (
                      "Not exported"
                    )}
                  </span>
                </span>
                <span className="block p-4">
                  <span className="block truncate text-[15.5px] font-medium text-ink">{s.title}</span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                    {s.clipCount} clip{s.clipCount === 1 ? "" : "s"} · {timecode(s.durationMs)} · {s.aspect} · edited {updatedFmt.format(s.updatedAt)}
                  </span>
                </span>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
