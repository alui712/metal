import type { LucideIcon } from "lucide-react";
import { EmptyState, PageContainer, PageHeader } from "./page";

/** Honest placeholder for a feature area that a later phase delivers. */
export function ComingSoon({
  eyebrow,
  title,
  description,
  icon,
  phase,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  phase: number;
}) {
  return (
    <PageContainer>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState
        icon={icon}
        title={`Arrives in Phase ${phase}`}
        description="This area is part of the roadmap and isn't built yet."
        action={{ href: "/status", label: "Check system status" }}
      />
    </PageContainer>
  );
}
