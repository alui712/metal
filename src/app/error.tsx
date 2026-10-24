"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageContainer className="max-w-3xl pt-16 md:pt-24">
      <div role="alert" className="rounded-3xl border border-danger/25 bg-danger/[0.05] px-6 py-14 text-center sm:px-12">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-danger/30 bg-surface-3">
          <TriangleAlert className="size-6 text-danger" strokeWidth={1.5} aria-hidden />
        </div>
        <h1 className="mt-6 text-[20px] font-semibold text-ink">Something went wrong</h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-muted">
          This view hit an unexpected error. Your recordings aren’t affected.
          {error.digest && <span className="mt-2 block font-mono text-[12px] text-ink-faint">Reference: {error.digest}</span>}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/status" variant="secondary">
            Check system status
          </ButtonLink>
        </div>
      </div>
    </PageContainer>
  );
}
