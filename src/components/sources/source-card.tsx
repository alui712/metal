import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type SourceState =
  | "not-connected"
  | "ready"
  | "coming"
  | "connected"
  | "connecting"
  | "error"
  | "worker-offline"
  | "checking"
  | "watching"
  | "attention"
  | "paused"
  | "empty";

const STATE: Record<SourceState, { label: string; dot: string; text: string }> = {
  "not-connected": { label: "Not connected", dot: "bg-ink-faint", text: "text-ink-muted" },
  coming: { label: "Coming soon", dot: "bg-warn", text: "text-warn" },
  ready: { label: "Available now", dot: "bg-ok shadow-[0_0_10px_var(--ok)]", text: "text-ok" },
  connected: { label: "Connected", dot: "bg-ok shadow-[0_0_10px_var(--ok)]", text: "text-ok" },
  connecting: { label: "Connecting…", dot: "bg-warn animate-pulse", text: "text-warn" },
  error: { label: "Not connected", dot: "bg-danger", text: "text-danger" },
  "worker-offline": { label: "Worker offline", dot: "bg-warn", text: "text-warn" },
  checking: { label: "Checking…", dot: "bg-ink-faint", text: "text-ink-muted" },
  watching: { label: "Watching", dot: "bg-ok shadow-[0_0_10px_var(--ok)]", text: "text-ok" },
  attention: { label: "Needs attention", dot: "bg-danger", text: "text-danger" },
  paused: { label: "Paused", dot: "bg-warn", text: "text-warn" },
  empty: { label: "Not set up", dot: "bg-ink-faint", text: "text-ink-muted" },
};

export function SourceCard({
  id,
  icon: Icon,
  title,
  description,
  state,
  children,
  className,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  state: SourceState;
  children?: React.ReactNode;
  className?: string;
}) {
  const s = STATE[state];
  return (
    <section aria-labelledby={`${id}-title`} className={cn("flex min-w-0 flex-col rounded-3xl border border-line bg-surface-2/60 p-6 sm:p-7", className)}>
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line-strong bg-surface-3 text-accent-ink">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <h2 id={`${id}-title`} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            <span className={cn("flex items-center gap-2 text-[12.5px] font-medium", s.text)}>
              <span aria-hidden className={cn("size-2 rounded-full", s.dot)} />
              {s.label}
            </span>
          </div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{description}</p>
        </div>
      </div>
      {children && <div className="mt-6 flex flex-1 flex-col">{children}</div>}
    </section>
  );
}

/** Numbered setup steps. */
export function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-ink-muted">
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[11px] text-ink-faint">
            {i + 1}
          </span>
          <span className="pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/** "Why this is disabled" footer for an unavailable action. */
export function Unavailable({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
      {children}
    </p>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint && <span className="text-[11.5px] text-ink-faint">{hint}</span>}
    </div>
  );
}

export const inputClass =
  "h-10 w-full min-w-0 rounded-xl border border-line bg-surface-3/60 px-3 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-accent/50 disabled:cursor-not-allowed disabled:opacity-60";
