import type { Metadata } from "next";
import { History } from "lucide-react";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Time Machine" };

export default function SessionsPage() {
  return (
    <ComingSoon
      eyebrow="Time Machine"
      title="Relive your nights"
      description="Recordings grouped into sessions on an interactive timeline, with the moments that mattered."
      icon={History}
      phase={4}
    />
  );
}
