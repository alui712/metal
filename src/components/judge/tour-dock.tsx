"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ChevronLeft, Compass, House, Minimize2, X } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { EASE_OUT } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import { dockHidden, onStep, tourSteps } from "@/lib/judge/tour";
import { FEATURE_ICON } from "./feature-icons";
import { endTour, setTourStep, useTour } from "./tour-store";

/** Floating guide for the judge tour: where you are, what to try, where next. */
export function TourDock() {
  const tour = useTour();
  const pathname = usePathname();
  // A Memory Dive (showcase → first stop) ends once the destination renders; the dock then fades in.
  useEffect(() => {
    if (pathname === "/showcase") return;
    const html = document.documentElement;
    html.removeAttribute("data-dive");
    document.querySelector("[data-dive-target]")?.removeAttribute("data-dive-target");
    if (html.hasAttribute("data-dive-focus")) {
      html.removeAttribute("data-dive-focus");
      // The button that started the tour is gone; keyboard users continue from the new page's heading.
      const h = document.querySelector<HTMLElement>("#main h1");
      if (h) {
        h.tabIndex = -1;
        h.focus({ preventScroll: true });
      }
    }
  }, [pathname]);
  const search = useSearchParams();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);

  const steps = tour ? tourSteps(tour.targets) : [];
  const index = tour ? Math.min(Math.max(tour.step, 0), steps.length - 1) : 0;
  const step = steps[index];
  const last = index === steps.length - 1;
  const here = step ? onStep(step, pathname, search) : false;

  const go = (i: number) => {
    setTourStep(i);
    router.push(steps[i].href);
  };
  const finish = () => {
    endTour();
    router.push("/showcase");
  };

  return (
    <AnimatePresence>
      {/* Relive is full-screen with its own controls; the dock returns when it closes. */}
      {tour && step && !dockHidden(pathname) && (
        <motion.section
          key="tour"
          aria-label="Guided demo"
          initial={{ opacity: 0, y: reduce ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : 16 }}
          transition={{ duration: reduce ? 0.15 : 0.45, ease: EASE_OUT }}
          className="tour-dock fixed inset-x-3 bottom-[5.75rem] z-50 md:inset-x-auto md:bottom-6 md:left-[calc(50%+8rem)] md:w-[min(44rem,calc(100vw-20rem))] md:-translate-x-1/2"
        >
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="glass ml-auto flex items-center gap-2.5 rounded-full border border-accent/40 py-2 pl-3 pr-4 text-[13px] font-medium text-ink shadow-[0_18px_50px_-18px_var(--violet-500)] md:mx-auto"
            >
              <Compass className="size-4 text-accent-ink" aria-hidden />
              Guided demo · {index + 1}/{steps.length} {step.label}
            </button>
          ) : (
            <div className="relative overflow-hidden rounded-2xl bg-surface-2/95 backdrop-blur-xl border border-line-strong shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9),0_0_0_1px_rgb(139_92_255/0.12)]">
              <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 size-44 rounded-full bg-accent/25 blur-3xl" />
              <div className="relative flex items-center gap-3 border-b border-line px-4 py-2.5">
                <Compass className="size-4 shrink-0 text-accent-ink" aria-hidden />
                <p className="text-[11.5px] font-medium uppercase tracking-[0.2em] text-accent-ink">Guided demo</p>
                <ol className="ml-1 flex flex-1 items-center gap-1.5" aria-label="Tour steps">
                  {steps.map((s, i) => (
                    <li key={s.id} className="flex-1">
                      <button
                        type="button"
                        onClick={() => go(i)}
                        aria-current={i === index ? "step" : undefined}
                        aria-label={`Step ${i + 1}: ${s.label}`}
                        title={s.label}
                        className="group block w-full py-2"
                      >
                        <span
                          className={cn(
                            "block h-1 rounded-full transition-colors duration-300",
                            i < index ? "bg-accent/60" : i === index ? "bg-accent" : "bg-surface-5 group-hover:bg-ink-faint",
                          )}
                        />
                      </button>
                    </li>
                  ))}
                </ol>
                <Link
                  href="/showcase"
                  aria-label="Back to the showcase"
                  title="Showcase"
                  className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <House className="size-4" aria-hidden />
                </Link>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  aria-label="Minimize the guide"
                  title="Minimize"
                  className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <Minimize2 className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={endTour}
                  aria-label="End the guided demo"
                  title="End tour"
                  className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <div className="relative flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: reduce ? 0 : 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: reduce ? 0 : -8 }}
                    transition={{ duration: reduce ? 0.12 : 0.28, ease: EASE_OUT }}
                    className="flex min-w-0 flex-1 gap-3.5"
                    aria-live="polite"
                  >
                    <StepIcon id={step.id} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-ink-faint">
                        {index + 1} of {steps.length} · {step.label}
                      </p>
                      <h2 className="mt-0.5 text-[16.5px] font-semibold tracking-[-0.015em] text-ink">{step.title}</h2>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-muted">
                        {here ? step.tip : "You’ve left the prepared demo. Return to this stop, or explore freely."}
                      </p>
                    </div>
                  </motion.div>
                </AnimatePresence>
                <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                  {index > 0 && (
                    <button type="button" onClick={() => go(index - 1)} className={buttonClass("ghost", "sm")} aria-label="Previous step">
                      <ChevronLeft className="size-4" aria-hidden /> Back
                    </button>
                  )}
                  {!here ? (
                    <button type="button" onClick={() => go(index)} className={buttonClass("primary", "sm")}>
                      Return to demo: {step.label}
                    </button>
                  ) : last ? (
                    <button type="button" onClick={finish} className={buttonClass("primary", "sm")}>
                      Finish tour
                    </button>
                  ) : (
                    <button type="button" onClick={() => go(index + 1)} className={buttonClass("primary", "sm")}>
                      Next: {steps[index + 1].label} <ArrowRight className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function StepIcon({ id }: { id: keyof typeof FEATURE_ICON }) {
  const Icon = FEATURE_ICON[id];
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent-ink">
      <Icon className="size-5" strokeWidth={1.75} aria-hidden />
    </span>
  );
}
