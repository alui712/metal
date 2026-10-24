import type { Metadata } from "next";
import { Suspense } from "react";
import { RecallExperience } from "@/components/recall/recall-experience";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";

export const metadata: Metadata = { title: "Recall" };

function RecallSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading search">
      <div className="h-[66px] animate-pulse rounded-2xl border border-line bg-surface-2" />
      <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-surface-2/70" />
        ))}
      </div>
    </div>
  );
}

export default function RecallPage() {
  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          eyebrow="Metal Recall"
          title={
            <>
              Find the moment, <span className="font-display font-normal italic text-accent-ink">not the file.</span>
            </>
          }
          description="Describe what happened in your own words. Recall jumps to the exact second and shows why it matched."
        />
        {/* useSearchParams is request data under Cache Components. */}
        <Suspense fallback={<RecallSkeleton />}>
          <RecallExperience />
        </Suspense>
      </PageContainer>
    </PageTransition>
  );
}
