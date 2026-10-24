import type { Metadata } from "next";
import { Clapperboard } from "lucide-react";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Story Studio" };

export default function StudioPage() {
  return (
    <ComingSoon
      eyebrow="Story Studio"
      title="Cut your story"
      description="Arrange real moments, describe the edit you want, and export an actual MP4."
      icon={Clapperboard}
      phase={5}
    />
  );
}
