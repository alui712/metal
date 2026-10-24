import {
  Activity,
  CircleDot,
  Clapperboard,
  History,
  LibraryBig,
  Radio,
  Search,
  SlidersHorizontal,
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
  { href: "/recall", label: "Recall", hint: "Search your memories", icon: Search },
  { href: "/sessions", label: "Time Machine", shortLabel: "Sessions", hint: "Relive your sessions", icon: History },
  { href: "/studio", label: "Story Studio", shortLabel: "Studio", hint: "Cut a montage", icon: Clapperboard },
];

export const secondaryNav: NavItem[] = [
  { href: "/sources", label: "Sources", hint: "OBS, watched folders, import", icon: Radio },
  { href: "/settings", label: "Capture settings", shortLabel: "Settings", hint: "Replay buffer, quality, hotkeys, audio", icon: SlidersHorizontal },
  { href: "/import", label: "Import", hint: "Add recordings", icon: Upload },
  { href: "/status", label: "System status", shortLabel: "Status", hint: "Services & worker health", icon: Activity },
];

export function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
