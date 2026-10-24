import {
  Activity,
  Clapperboard,
  History,
  House,
  Search,
  Upload,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  /** Short description, used by the command palette. */
  hint: string;
  icon: LucideIcon;
};

export const primaryNav: NavItem[] = [
  { href: "/", label: "Home", hint: "Your library", icon: House },
  { href: "/recall", label: "Recall", hint: "Search your memories", icon: Search },
  { href: "/sessions", label: "Time Machine", hint: "Relive your sessions", icon: History },
  { href: "/studio", label: "Story Studio", hint: "Cut a montage", icon: Clapperboard },
];

export const secondaryNav: NavItem[] = [
  { href: "/import", label: "Import", hint: "Add recordings", icon: Upload },
  { href: "/status", label: "System status", hint: "Services & worker health", icon: Activity },
];

export function isActive(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
