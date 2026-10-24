import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { RefreshButton } from "@/components/status/refresh-button";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";
import { cn } from "@/lib/cn";
import { runHealthChecks, type CheckState } from "@/server/health";

export const metadata: Metadata = { title: "System status" };

const stateStyles: Record<CheckState, { dot: string; label: string; text: string }> = {
  ok: { dot: "bg-ok shadow-[0_0_10px_var(--ok)]", label: "Operational", text: "text-ok" },
  warn: { dot: "bg-warn shadow-[0_0_10px_var(--warn)]", label: "Degraded", text: "text-warn" },
  error: { dot: "bg-danger shadow-[0_0_10px_var(--danger)]", label: "Unavailable", text: "text-danger" },
};

async function Checks() {
  await connection();
  const checks = await runHealthChecks();
  const worst: CheckState = checks.some((c) => c.state === "error")
    ? "error"
    : checks.some((c) => c.state === "warn")
      ? "warn"
      : "ok";

  return (
    <>
      <div className="mb-6 flex items-center gap-3 text-[15px]" role="status">
        <span className={cn("size-2.5 rounded-full", stateStyles[worst].dot)} aria-hidden />
        <span className="text-ink">
          {worst === "ok"
            ? "All systems operational"
            : worst === "warn"
              ? "Some features are degraded"
              : "Some features are unavailable"}
        </span>
      </div>
      <ul className="overflow-hidden rounded-3xl border border-line bg-surface-2/70">
        {checks.map((check) => {
          const s = stateStyles[check.state];
          return (
            <li
              key={check.id}
              className="flex flex-col gap-3 border-b border-line px-6 py-5 last:border-b-0 sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <span className={cn("mt-2 size-2 shrink-0 rounded-full", s.dot)} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-ink">{check.label}</p>
                  <p className="mt-0.5 break-words font-mono text-[12.5px] text-ink-muted">
                    {check.detail}
                  </p>
                  {check.state !== "ok" && (
                    <p className="mt-2 text-[13px] text-ink-faint">
                      Affects: {check.affects.join(", ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5 pl-6 sm:items-end sm:pl-0">
                <span className={cn("text-[13px] font-medium", s.text)}>{s.label}</span>
                {check.fix && (
                  <code className="rounded-md border border-line bg-surface-3 px-2 py-1 font-mono text-[12px] text-ink-muted">
                    {check.fix}
                  </code>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ChecksSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Running checks">
      <div className="h-6 w-56 animate-pulse rounded-lg bg-surface-3" />
      <div className="h-[420px] animate-pulse rounded-3xl border border-line bg-surface-2/50" />
    </div>
  );
}

export default function StatusPage() {
  return (
    <PageTransition>
      <PageContainer className="max-w-4xl">
        <PageHeader
          eyebrow="System"
          title="Status"
          description="Live checks of the local services METAL depends on. Features degrade gracefully when one is unavailable — nothing is ever faked."
          actions={<RefreshButton />}
        />
        <Suspense fallback={<ChecksSkeleton />}>
          <Checks />
        </Suspense>
      </PageContainer>
    </PageTransition>
  );
}
