import {
  Activity,
  CircleDot,
  Clapperboard,
  Columns2,
  History,
  LibraryBig,
  Radio,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  /** Label for the compact mobile tab bar. */
  shortLabel?: string;
  /** Short description, used by the command palette. */
  hint: string;
  icon: LucideIcon;
};

export const primaryNav: NavItem[] = [
  { href: "/", label: "Capture", hint: "Recording dashboard", icon: CircleDot },
  { href: "/library", label: "Library", hint: "All recordings", icon: LibraryBig },
  { href: "/clips", label: "Smart Clip", shortLabel: "Clips", hint: "Suggested clips from your recordings", icon: Scissors },
  { href: "/recall", label: "Recall", hint: "Search your memories", icon: Search },
  { href: "/sessions", label: "Time Machine", shortLabel: "Sessions", hint: "Relive your sessions", icon: History },
  { href: "/povs", label: "Multi-POV", shortLabel: "POV", hint: "Synced angles of one match, side by side", icon: Columns2 },
  { href: "/studio", label: "Story Studio", shortLabel: "Studio", hint: "Cut a montage", icon: Clapperboard },
];

export const secondaryNav: NavItem[] = [
  { href: "/sources", label: "Sources", hint: "OBS, watched folders, import", icon: Radio },
  { href: "/settings", label: "Capture settings", shortLabel: "Settings", hint: "Replay buffer, quality, hotkeys, audio", icon: SlidersHorizontal },
  { href: "/import", label: "Import", hint: "Add recordings", icon: Upload },
  { href: "/status", label: "System status", shortLabel: "Status", hint: "Services & worker health", icon: Activity },
];

/** The judge-facing entry: showcase + guided demo. Shown apart from the feature nav. */
export const showcaseNav: NavItem = { href: "/showcase", label: "Showcase", hint: "Guided demo for first-time visitors", icon: Sparkles };

export function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
