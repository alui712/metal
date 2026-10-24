"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, Search } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { isActive, primaryNav, secondaryNav, type NavItem } from "./nav-items";
import { openCommandPalette } from "./command-palette";

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors duration-200",
        active
          ? "bg-surface-4/70 text-ink"
          : "text-ink-muted hover:bg-surface-3 hover:text-ink",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-accent shadow-[0_0_12px_var(--violet-500)]"
        />
      )}
      <Icon
        className={cn(
          "size-[18px] transition-colors",
          active ? "text-accent-ink" : "text-ink-faint group-hover:text-ink-muted",
        )}
        strokeWidth={1.75}
      />
      {item.label}
    </Link>
  );
}

/**
 * Sidebar nav. `pathname` is null in the prerendered fallback (no active
 * state); the live version reads it from the router.
 */
export function SidebarNav({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-8">
      <Link href="/" className="px-3 pt-1" aria-label="METAL home">
        <Wordmark />
      </Link>

      <button
        type="button"
        onClick={openCommandPalette}
        className="mx-1 flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left text-[13px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted"
      >
        <span className="flex-1">Search memories…</span>
        <kbd className="flex items-center gap-0.5 rounded-md border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
          <Command className="size-3" aria-hidden />K
        </kbd>
      </button>

      <ul className="flex flex-col gap-1">
        {primaryNav.map((item) => (
          <li key={item.href}>
            <SidebarLink item={item} active={isActive(item.href, pathname)} />
          </li>
        ))}
      </ul>

      <ul className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
        {secondaryNav.map((item) => (
          <li key={item.href}>
            <SidebarLink item={item} active={isActive(item.href, pathname)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function LiveSidebarNav() {
  return <SidebarNav pathname={usePathname()} />;
}

/** Compact bottom tab bar for small screens. */
export function TabBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-line-strong md:hidden"
    >
      <ul className="grid grid-cols-5">
        {[...primaryNav, secondaryNav[0]].map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium",
                  active ? "text-ink" : "text-ink-faint",
                )}
              >
                <Icon
                  className={cn("size-5", active && "text-accent-ink")}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {item.label.replace("Story ", "")}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Small-screen top bar: brand + search. */
export function MobileHeader() {
  return (
    <header className="flex items-center justify-between px-4 pt-4 md:hidden">
      <Link href="/" aria-label="METAL home">
        <Wordmark />
      </Link>
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Search memories"
        className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted"
      >
        <Search className="size-[18px]" strokeWidth={1.75} aria-hidden />
      </button>
    </header>
  );
}

export function LiveTabBar() {
  return <TabBar pathname={usePathname()} />;
}
