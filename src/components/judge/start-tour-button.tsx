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
  dive = false,
}: {
  targets: TourTargets;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary";
  className?: string;
  children?: React.ReactNode;
  /** From the showcase: the "Memory Dive" transition into the first stop (see globals.css). */
  dive?: boolean;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        startTour(targets);
        // Never waits: the copy starts fading as navigation starts, and the browser's view
        // transition (if any) does the rest. Reduced motion navigates plainly.
        const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (dive && !still) {
          const html = document.documentElement;
          html.setAttribute("data-dive", "");
          // Safety net if navigation never happens; normally the dock clears it on arrival.
          setTimeout(() => location.pathname === "/showcase" && html.removeAttribute("data-dive"), 3000);
        }
        router.push(tourSteps(targets)[0].href, still ? undefined : { transitionTypes: [dive ? "dive" : "portal"] });
      }}
      className={buttonClass(variant, size, className)}
    >
      <Play className="size-4 fill-current" aria-hidden />
      {children}
    </button>
  );
}
