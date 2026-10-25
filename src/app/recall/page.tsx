import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { LibraryRecall } from "@/components/recall/library-recall";
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
          description="Search what was said in your recordings — or describe what was on screen. Recall jumps to the moment and shows why it matched."
        />
        <p className="-mt-4 mb-6 text-[12.5px] text-ink-faint">
          Want to see the full concept?{" "}
          <Link href="/recall/demo" className="font-medium text-accent-ink hover:text-white">
            Try Recall on demo memories →
          </Link>
        </p>
        {/* useSearchParams is request data under Cache Components. */}
        <Suspense fallback={<RecallSkeleton />}>
          <LibraryRecall />
        </Suspense>
      </PageContainer>
    </PageTransition>
  );
}
