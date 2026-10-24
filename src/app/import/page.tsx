import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <ComingSoon
      eyebrow="Import"
      title="Bring in your recordings"
      description="Add local gameplay videos. METAL keeps the originals untouched and prepares them for playback and analysis."
      icon={Upload}
      phase={1}
    />
  );
}
