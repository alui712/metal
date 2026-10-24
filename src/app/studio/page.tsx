import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioFromParams } from "@/components/studio/studio-from-params";
import { PageContainer } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";

export const metadata: Metadata = { title: "Story Studio" };

function StudioSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading editor" className="space-y-6">
      <div className="h-12 w-72 animate-pulse rounded-xl bg-surface-2" />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="h-[460px] animate-pulse rounded-2xl bg-surface-2/70" />
        <div className="h-[460px] animate-pulse rounded-2xl bg-surface-2/50" />
      </div>
      <div className="h-36 animate-pulse rounded-2xl bg-surface-2/50" />
    </div>
  );
}

export default function StudioPage() {
  return (
    <PageTransition>
      <PageContainer className="max-w-[1440px]">
        <p className="mb-2 text-[12px] font-medium uppercase tracking-[0.2em] text-accent-ink">Story Studio</p>
        {/* useSearchParams (?session=) is request data under Cache Components. */}
        <Suspense fallback={<StudioSkeleton />}>
          <StudioFromParams />
        </Suspense>
      </PageContainer>
    </PageTransition>
  );
}
