import { ChevronDown, CircleHelp } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A feature's workflow as a compact numbered row. `current` highlights the
 * step the user is on; earlier steps read as done.
 */
export function StepStrip({ steps, current, label, className }: { steps: string[]; current?: number; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]", className)}>
      {steps.map((step, i) => {
        const state = current === undefined ? "todo" : i < current ? "done" : i === current ? "now" : "todo";
        return (
          <li key={step} className="flex items-center gap-1.5" aria-current={state === "now" ? "step" : undefined}>
            {i > 0 && <span aria-hidden className="h-px w-3 bg-line-strong" />}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium",
                state === "now" ? "border-accent/50 bg-accent/10 text-accent-ink" : state === "done" ? "border-line text-ink-muted" : "border-line text-ink-faint",
              )}
            >
              <span className="font-mono text-[10.5px] tabular-nums">{i + 1}</span>
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Optional, collapsed "How it works" help: a few numbered sentences, never a tutorial wall. */
export function HowItWorks({
  steps,
  note,
  summary = "How it works",
  className,
}: {
  steps: React.ReactNode[];
  note?: React.ReactNode;
  summary?: string;
  className?: string;
}) {
  return (
    <details className={cn("group text-[12.5px]", className)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md font-medium text-ink-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
        <CircleHelp className="size-3.5" aria-hidden />
        {summary}
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="mt-2 rounded-xl border border-line bg-surface/50 px-3.5 py-3">
        <ol className="space-y-1.5 leading-relaxed text-ink-muted">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-px font-mono text-[11px] tabular-nums text-accent-ink">{i + 1}</span>
              <span className="min-w-0">{s}</span>
            </li>
          ))}
        </ol>
        {note && <p className="mt-2.5 border-t border-line pt-2.5 text-[12px] leading-relaxed text-ink-faint">{note}</p>}
      </div>
    </details>
  );
}
