import { Clapperboard, Columns2, History, Search, type LucideIcon } from "lucide-react";
import type { TourStepId } from "@/lib/judge/tour";

export const FEATURE_ICON: Record<TourStepId, LucideIcon> = {
  recall: Search,
  timemachine: History,
  pov: Columns2,
  studio: Clapperboard,
};
