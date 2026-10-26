import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Laptop } from "lucide-react";
import { ButtonLink, PageContainer, PageHeader } from "@/components/ui/page";
import { isPublicDemo } from "@/server/public-demo";

export const metadata: Metadata = { title: "Runs locally" };

/** Public online demo only (src/proxy.ts sends Import, Sources and Capture settings here). */
export default function LocalOnlyPage() {
  if (!isPublicDemo()) notFound();
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Online demo"
        title="This part runs on your own computer"
        description="Recording through OBS, importing videos and watching folders all work on the computer METAL is installed on, and nothing is uploaded. This online demo is read-only, with approved sample recordings that are already indexed."
      />
      <div className="flex max-w-2xl items-start gap-3 rounded-2xl border border-line bg-surface-2/60 p-5 text-[14px] leading-relaxed text-ink-muted">
        <Laptop className="mt-0.5 size-5 shrink-0 text-accent-ink" aria-hidden />
        <p>
          To try it with your own recordings, run METAL locally. The setup steps are in the project’s README.
        </p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/showcase">Start the guided demo</ButtonLink>
        <ButtonLink href="/recall" variant="secondary">Try Recall</ButtonLink>
      </div>
    </PageContainer>
  );
}
