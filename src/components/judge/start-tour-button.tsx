"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { tourSteps, type TourTargets } from "@/lib/judge/tour";
import { startTour } from "./tour-store";

/** How long the live part of the Memory Dive runs before navigation (globals.css is timed to it). */
const DIVE_LEAD_MS = 380;

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
  /** From the showcase: the "Memory Dive" into the first stop (see globals.css). */
  dive?: boolean;
}) {
  const router = useRouter();
  const going = useRef(false);
  const href = tourSteps(targets)[0].href;
  // The dive should land on a warm route, even on the first click.
  useEffect(() => {
    if (dive) router.prefetch(href);
  }, [dive, href, router]);
  return (
    <button
      type="button"
      onPointerEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      onClick={(e) => {
        if (going.current) return; // a double click starts one dive
        going.current = true;
        setTimeout(() => (going.current = false), 1500);
        startTour(targets);
        const html = document.documentElement;
        html.setAttribute("data-dive-focus", ""); // the destination's heading takes focus (tour-dock.tsx)
        // Memory Dive: activation and the dive run live while the first stop loads, then the
        // view transition dissolves into it. Nothing waits on an asset; without view
        // transitions (or with reduced motion) it navigates at once.
        const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (dive && !still && "startViewTransition" in document) {
          e.currentTarget.setAttribute("data-diving", "");
          html.setAttribute("data-dive", "demo");
          router.prefetch(href);
          setTimeout(() => router.push(href, { transitionTypes: ["dive"] }), DIVE_LEAD_MS);
          // Safety net if navigation never happens; normally the dock clears it on arrival.
          setTimeout(() => location.pathname === "/showcase" && html.removeAttribute("data-dive"), 3000);
          return;
        }
        router.push(href, still ? undefined : { transitionTypes: ["portal"] });
      }}
      className={buttonClass(variant, size, className)}
    >
      <Play className="size-4 fill-current" aria-hidden />
      {children}
    </button>
  );
}
