import { ViewTransition } from "react";

/**
 * Route-level enter/exit animation. Put it in each page (not a layout —
 * layouts persist, so enter/exit never fire there). Navigations crossfade
 * with a short rise; links tagged `nav-forward` / `nav-back` slide instead,
 * `portal` (Enter METAL from the showcase) settles in, and `dive` (Start guided demo)
 * arrives at the end of the showcase's Memory Dive.
 * Animations are defined in globals.css.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", portal: "portal-in", dive: "dive-in", default: "page-in" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page-out" }}
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}
