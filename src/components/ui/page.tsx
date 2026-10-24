import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { ButtonLink } from "./button";

export { ButtonLink };

export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 md:py-12", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  badge,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {(eyebrow || badge) && (
          <div className="mb-3 flex items-center gap-3">
            {eyebrow && (
              <p className="text-[12px] font-medium uppercase tracking-[0.2em] text-accent-ink">{eyebrow}</p>
            )}
            {badge}
          </div>
        )}
        <h1 className="text-[clamp(2.25rem,4.5vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-4 text-[16px] leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export function SectionHeading({
  id,
  title,
  action,
  className,
}: {
  id?: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex items-end justify-between gap-4", className)}>
      <h2 id={id} className="text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  action?: { href: string; label: string };
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-line bg-surface-2/70 px-6 py-16 text-center sm:px-12",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-40 w-[30rem] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-3xl"
      />
      <div className="relative mx-auto grid size-14 place-items-center rounded-2xl border border-line-strong bg-surface-3">
        <Icon className="size-6 text-accent-ink" strokeWidth={1.5} aria-hidden />
      </div>
      <h2 className="relative mt-6 text-[20px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <p className="relative mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-muted">
        {description}
      </p>
      {action && (
        <ButtonLink href={action.href} className="relative mt-8">
          {action.label}
        </ButtonLink>
      )}
      {children && <div className="relative mt-8">{children}</div>}
    </div>
  );
}
