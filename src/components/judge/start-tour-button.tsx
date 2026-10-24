"use client";

import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { tourSteps, type TourTargets } from "@/lib/judge/tour";
import { startTour } from "./tour-store";

export function StartTourButton({
  targets,
  size = "lg",
  variant = "primary",
  className,
  children = "Start guided demo",
}: {
  targets: TourTargets;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        startTour(targets);
        router.push(tourSteps(targets)[0].href);
      }}
      className={buttonClass(variant, size, className)}
    >
      <Play className="size-4 fill-current" aria-hidden />
      {children}
    </button>
  );
}
