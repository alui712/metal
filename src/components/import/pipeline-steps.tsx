import { Check, Circle, CircleAlert, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export type StepState = "pending" | "active" | "done" | "failed" | "unavailable";

export const PIPELINE_STEPS = [
  { id: "store", label: "Store original" },
  { id: "probe", label: "Read metadata" },
  { id: "proxy", label: "Make playable copy" },
  { id: "transcribe", label: "Transcribe voice" },
  { id: "analyze", label: "Find moments" },
  { id: "index", label: "Make searchable" },
] as const;

const ICONS: Record<StepState, typeof Check> = {
  pending: Circle,
  active: LoaderCircle,
  done: Check,
  failed: CircleAlert,
  unavailable: Circle,
};

/**
 * Processing progress for one recording, driven by real upload and job
 * state. Analysis steps stay "unavailable" until that pipeline exists.
 */
export function PipelineSteps({
  states,
  className,
}: {
  states: Partial<Record<(typeof PIPELINE_STEPS)[number]["id"], StepState>>;
  className?: string;
}) {
  return (
    <ol className={cn("flex flex-wrap gap-x-1 gap-y-2", className)} aria-label="Processing steps">
      {PIPELINE_STEPS.map((step, i) => {
        const state = states[step.id] ?? "pending";
        const Icon = ICONS[state];
        return (
          <li key={step.id} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium",
                state === "done" && "border-ok/30 bg-ok/10 text-ok",
                state === "active" && "border-accent/40 bg-accent/10 text-accent-ink",
                state === "failed" && "border-danger/30 bg-danger/10 text-danger",
                (state === "pending" || state === "unavailable") && "border-line text-ink-faint",
              )}
            >
              <Icon className={cn("size-3", state === "active" && "animate-spin")} aria-hidden />
              {step.label}
              <span className="sr-only">: {state === "unavailable" ? "not available yet" : state}</span>
            </span>
            {i < PIPELINE_STEPS.length - 1 && <span aria-hidden className="h-px w-2 bg-line-strong" />}
          </li>
        );
      })}
    </ol>
  );
}
