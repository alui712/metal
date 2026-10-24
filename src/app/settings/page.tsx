import type { Metadata } from "next";
import { CaptureSettingsForm } from "@/components/capture/capture-settings-form";
import { Notice } from "@/components/ui/demo-badge";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { PageTransition } from "@/components/ui/page-transition";

export const metadata: Metadata = { title: "Capture settings" };

export default function SettingsPage() {
  return (
    <PageTransition>
      <PageContainer className="max-w-5xl pb-24">
        <PageHeader
          eyebrow="Settings"
          title="Capture"
          description="How METAL asks OBS to record: how far back clips reach, quality, shortcuts, and audio."
        />
        <Notice tone="info" className="mb-2">
          Saved on this device as you change them. They take effect once OBS is connected (Phase 4) — nothing is being
          recorded yet.
        </Notice>
        <CaptureSettingsForm />
      </PageContainer>
    </PageTransition>
  );
}
