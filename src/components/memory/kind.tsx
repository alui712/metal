import {
  Flame,
  Laugh,
  Sparkles,
  Swords,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { MomentKind } from "@/lib/memory/contracts";
import { cn } from "@/lib/cn";

export const KIND_META: Record<MomentKind, { label: string; icon: LucideIcon; tone: string }> = {
  clutch: { label: "Clutch", icon: Swords, tone: "text-accent-ink" },
  victory: { label: "Victory", icon: Trophy, tone: "text-warn" },
  funny: { label: "Funny", icon: Laugh, tone: "text-ok" },
  fail: { label: "Fail", icon: Flame, tone: "text-danger" },
  highlight: { label: "Highlight", icon: Sparkles, tone: "text-accent-ink" },
  reaction: { label: "Reaction", icon: Zap, tone: "text-ink-muted" },
};

export function KindTag({ kind, className }: { kind: MomentKind; className?: string }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", meta.tone, className)}>
      <Icon className="size-3.5" strokeWidth={2} aria-hidden />
      {meta.label}
    </span>
  );
}
