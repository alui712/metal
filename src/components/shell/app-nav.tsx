"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, Search, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { Wordmark } from "@/components/brand/logo";
import { CaptureStatusPill, SidebarCaptureStatus } from "@/components/capture/capture-status";
import { cn } from "@/lib/cn";
import { isActive, primaryNav, secondaryNav, showcaseNav, type NavItem } from "./nav-items";
import { openCommandPalette } from "./command-palette";

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors duration-200",
        active ? "text-ink" : "text-ink-muted hover:bg-surface-3/70 hover:text-ink",
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          aria-hidden
          className="absolute inset-0 rounded-xl border border-line bg-surface-3"
          transition={{ type: "spring", bounce: 0.12, duration: 0.45 }}
        >
          <span className="absolute inset-y-2.5 -left-px w-[2px] rounded-full bg-accent" />
        </motion.span>
      )}
      <Icon
        className={cn(
          "relative size-[18px] transition-colors",
          active ? "text-accent-ink" : "text-ink-faint group-hover:text-ink-muted",
        )}
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="relative">{item.label}</span>
    </Link>
  );
}

/**
 * Sidebar nav. `pathname` is null in the prerendered fallback (no active
 * state); the live version reads it from the router.
 */
export function SidebarNav({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-7">
      <Link href="/" className="rounded-lg px-3 pt-1" aria-label="METAL home">
        <Wordmark />
      </Link>

      <button
        type="button"
        onClick={openCommandPalette}
        className="mx-1 flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left text-[13px] text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted"
      >
        <Search className="size-4" strokeWidth={1.75} aria-hidden />
        <span className="flex-1">Search or jump to…</span>
        <kbd className="flex items-center gap-0.5 rounded-md border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
          <Command className="size-3" aria-hidden />K
        </kbd>
      </button>

      <ul className="flex flex-col gap-0.5">
        <li className="mb-2">
          <Link
            href={showcaseNav.href}
            className="group mx-1 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/[0.08] px-3 py-2.5 text-[13.5px] font-medium text-accent-ink transition-colors hover:border-accent/55 hover:bg-accent/15 hover:text-white"
          >
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
            <span className="flex-1">Showcase &amp; guided demo</span>
          </Link>
        </li>
        {primaryNav.map((item) => (
          <li key={item.href}>
            <SidebarLink item={item} active={isActive(item.href, pathname)} />
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-4">
        <ul className="flex flex-col gap-0.5 border-t border-line pt-4">
          {secondaryNav.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} active={isActive(item.href, pathname)} />
            </li>
          ))}
        </ul>
        <SidebarCaptureStatus />
      </div>
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
      data-shell
      aria-label="Primary"
      className="glass fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-line-strong pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-7">
        {primaryNav.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors",
                  active ? "text-ink" : "text-ink-faint",
                )}
              >
                <Icon className={cn("size-5", active && "text-accent-ink")} strokeWidth={1.75} aria-hidden />
                {item.shortLabel ?? item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Small-screen top bar: brand, capture status, search. */
export function MobileHeader() {
  return (
    <header data-shell className="flex items-center justify-between px-4 pt-4 md:hidden">
      <Link href="/" aria-label="METAL home" className="rounded-lg">
        <Wordmark />
      </Link>
      <div className="flex gap-2">
        <CaptureStatusPill />
        <Link
          href={showcaseNav.href}
          aria-label="Showcase and guided demo"
          className="grid size-10 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent-ink"
        >
          <Sparkles className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </Link>
        <button
          type="button"
          onClick={openCommandPalette}
          aria-label="Search or jump to"
          className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2 text-ink-muted"
        >
          <Search className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </header>
  );
}

export function LiveTabBar() {
  return <TabBar pathname={usePathname()} />;
}
