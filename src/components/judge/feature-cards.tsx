import Link from "next/link";
import { ArrowUpRight, Quote } from "lucide-react";
import { InView } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import { duration, plural } from "@/lib/format";
import { tourSteps, type TourStepId } from "@/lib/judge/tour";
import type { Spotlight } from "@/server/judge/spotlight";
import { tourTargets } from "@/server/judge/spotlight";
import { FEATURE_ICON } from "./feature-icons";

const PITCH: Record<TourStepId, string> = {
  recall: "Search your recordings by what was said: exact words or the gist.",
  timemachine: "Every recording, grouped into the night you played it.",
  pov: "Your friend’s recording of the same match, synced to yours.",
  studio: "Cut the best moments into a story and export an MP4.",
};

/** The four headline features, each with evidence from the real library. */
export function FeatureCards({ spotlight, className }: { spotlight: Spotlight; className?: string }) {
  const steps = tourSteps(tourTargets(spotlight));
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {steps.map((step, i) => {
        const Icon = FEATURE_ICON[step.id];
        return (
          <li key={step.id} className="flex">
            <InView delay={i * 0.07} className="flex w-full">
              <Link
                href={step.href}
                className="group relative isolate flex w-full flex-col overflow-hidden rounded-3xl border border-line bg-surface-2/70 p-5 transition-[transform,border-color,box-shadow] duration-300 ease-[var(--ease-out)] hover:-translate-y-1 hover:border-accent/45 hover:shadow-[0_24px_60px_-28px_var(--violet-500)] focus-visible:-translate-y-1 focus-visible:border-accent/45 focus-visible:shadow-[0_24px_60px_-28px_var(--violet-500)] active:translate-y-0 active:scale-[0.985] active:duration-100"
              >
                <span
                  aria-hidden
                  className="absolute -right-12 -top-16 -z-10 size-48 rounded-full bg-accent/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100"
                />
                <span className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl border border-line-strong bg-surface-3 text-accent-ink transition-colors group-hover:border-accent/40 group-hover:bg-accent/10 group-focus-visible:border-accent/40 group-focus-visible:bg-accent/10">
                    <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                  </span>
                  <span className="font-mono text-[12px] tracking-[0.2em] text-ink-faint">0{i + 1}</span>
                </span>
                <span className="mt-5 block text-[19px] font-semibold tracking-[-0.02em] text-ink">{step.label}</span>
                <span className="mt-1.5 block text-[13.5px] leading-relaxed text-ink-muted">{PITCH[step.id]}</span>
                <span className="mt-5 block flex-1">
                  <Evidence id={step.id} spotlight={spotlight} />
                </span>
                <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-ink transition-colors group-hover:text-white">
                  Open {step.label}
                  <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </InView>
          </li>
        );
      })}
    </ul>
  );
}

function Evidence({ id, spotlight: s }: { id: TourStepId; spotlight: Spotlight }) {
  const box = "block rounded-2xl border border-line bg-surface/70 px-3.5 py-3 text-[12.5px] leading-relaxed";
  if (id === "recall") {
    return s.recall ? (
      <span className={box}>
        <span className="flex items-start gap-2 text-ink">
          <Quote className="mt-0.5 size-3.5 shrink-0 text-accent-ink" aria-hidden />
          <span className="line-clamp-2">{s.recall.line}</span>
        </span>
        <span className="mt-1.5 block text-ink-faint">
          {s.recall.label ? `Said in “${s.recall.label}”` : "Said in an approved recording"} · searched on this computer
        </span>
      </span>
    ) : (
      <span className={cn(box, "text-ink-faint")}>No transcripts yet. Transcribe a recording to search it.</span>
    );
  }
  if (id === "timemachine") {
    return s.night ? (
      <span className={box}>
        <span className="block font-medium text-ink">{s.night.title}</span>
        <span className="mt-1 block text-ink-faint">
          {plural(s.night.recordingCount, "recording")} · {duration(s.night.footageMs)} · {plural(s.night.momentCount, "moment")}
        </span>
      </span>
    ) : (
      <span className={cn(box, "text-ink-faint")}>No nights yet. Import recordings to build one.</span>
    );
  }
  if (id === "pov") {
    return s.pov ? (
      <span className={box}>
        <span className="block truncate font-medium text-ink">{s.pov.titles.join(" + ")}</span>
        <span className="mt-1 flex items-center gap-1.5 text-ink-faint">
          <span className={cn("size-1.5 rounded-full", s.pov.status === "confirmed" ? "bg-emerald-400" : "bg-amber-400")} aria-hidden />
          {plural(s.pov.members.length, "POV")} · {s.pov.status === "confirmed" ? "sync confirmed" : "sync suggested, not confirmed"}
        </span>
      </span>
    ) : (
      <span className={cn(box, "text-ink-faint")}>No synced POVs yet. Pair a friend’s recording of the same match.</span>
    );
  }
  return s.story ? (
    <span className={box}>
      <span className="block truncate font-medium text-ink">{s.story.title}</span>
      <span className="mt-1 block text-ink-faint">
        {plural(s.story.clipCount, "clip")}
        {s.story.exported ? " · MP4 exported" : " · not exported yet"}
      </span>
    </span>
  ) : (
    <span className={cn(box, "text-ink-faint")}>No stories yet. Send moments from a night to start one.</span>
  );
}
