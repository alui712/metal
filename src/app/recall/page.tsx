import type { Metadata } from "next";
import { Search } from "lucide-react";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Recall" };

export default function RecallPage() {
  return (
    <ComingSoon
      eyebrow="Metal Recall"
      title="Search every moment"
      description="Ask in plain language and jump straight to the real moment, with the evidence that matched."
      icon={Search}
      phase={3}
    />
  );
}
