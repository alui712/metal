import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 md:py-12", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.2em] text-accent-ink">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-4 text-[16px] leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-3">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-2/70 px-6 py-16 text-center sm:px-12">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-48 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-3xl"
      />
      <div className="relative mx-auto grid size-14 place-items-center rounded-2xl border border-line-strong bg-surface-3">
        <Icon className="size-6 text-accent-ink" strokeWidth={1.5} aria-hidden />
      </div>
      <h2 className="relative mt-6 text-[20px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </h2>
      <p className="relative mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-muted">
        {description}
      </p>
      {action && (
        <ButtonLink href={action.href} className="relative mt-8">
          {action.label}
        </ButtonLink>
      )}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[14px] font-medium transition-all duration-200",
        variant === "primary"
          ? "bg-accent text-white shadow-[0_8px_30px_-8px_var(--violet-500)] hover:bg-accent-strong"
          : "border border-line-strong bg-surface-3 text-ink hover:bg-surface-4",
        className,
      )}
    >
      {children}
    </Link>
  );
}
