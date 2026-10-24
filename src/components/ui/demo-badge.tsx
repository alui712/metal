import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";

/** Marks content that comes from demo fixtures, not the user's recordings. */
export function DemoBadge({ className, label = "Demo data" }: { className?: string; label?: string }) {
  return (
    <span
      title="Fictional sample data used until real recordings are imported"
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-warn/25 bg-warn/10 px-2.5 text-[11px] font-medium tracking-wide text-warn",
        className,
      )}
    >
      <FlaskConical className="size-3" strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

/** Inline explanation banner for demo-backed or not-yet-connected features. */
export function Notice({
  children,
  tone = "demo",
  className,
}: {
  children: React.ReactNode;
  tone?: "demo" | "info";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed",
        tone === "demo" ? "border-warn/20 bg-warn/[0.06] text-warn/90" : "border-line bg-surface-2 text-ink-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}
