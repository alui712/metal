import type { Metadata } from "next";
import { ImportExperience } from "@/components/import/import-experience";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <PageTransition>
      <PageContainer>
        <PageHeader
          eyebrow="Import"
          title="Bring in your recordings"
          description="Add gameplay videos from this computer. METAL checks them right here in your browser before anything is imported."
        />
        <ImportExperience />
      </PageContainer>
    </PageTransition>
  );
}
