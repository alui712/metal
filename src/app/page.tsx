import { Film } from "lucide-react";
import { Suspense } from "react";
import { HeroSearch } from "@/components/home/hero-search";
import { EmptyState, PageContainer } from "@/components/ui/page";
import { getLibraryStats } from "@/server/library";

async function Library() {
  const { recordingCount } = await getLibraryStats();
  if (recordingCount === 0) {
    return (
      <EmptyState
        icon={Film}
        title="Your library is waiting"
        description="Import a few gameplay recordings and METAL will turn them into moments you can search, relive, and cut into stories."
        action={{ href: "/import", label: "Import recordings" }}
      />
    );
  }
  return (
    <p className="text-[15px] text-ink-muted">
      {recordingCount} recording{recordingCount === 1 ? "" : "s"} in your library.
    </p>
  );
}

function LibrarySkeleton() {
  return <div className="h-72 animate-pulse rounded-3xl border border-line bg-surface-2/50" />;
}

export default function Home() {
  return (
    <PageContainer>
      <section className="flex flex-col items-start gap-8 pb-16 pt-6 md:pt-16">
        <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-accent-ink">
          Your gaming memory
        </p>
        <h1 className="max-w-3xl text-[clamp(2.75rem,7vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.045em] text-ink">
          Every moment has a{" "}
          <span className="font-display font-normal italic tracking-[-0.02em] text-accent-ink">
            story.
          </span>
        </h1>
        <p className="max-w-xl text-[17px] leading-relaxed text-ink-muted">
          Search your recordings in plain language, relive whole nights on a timeline, and cut
          the best of it into something worth sharing.
        </p>
        <HeroSearch />
      </section>

      <section aria-labelledby="library-heading">
        <h2 id="library-heading" className="mb-5 text-[13px] font-medium uppercase tracking-[0.18em] text-ink-faint">
          Library
        </h2>
        <Suspense fallback={<LibrarySkeleton />}>
          <Library />
        </Suspense>
      </section>
    </PageContainer>
  );
}
