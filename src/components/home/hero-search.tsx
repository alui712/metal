"use client";

import { Search } from "lucide-react";
import { openCommandPalette } from "@/components/shell/command-palette";

export function HeroSearch() {
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      className="group flex w-full max-w-2xl items-center gap-4 rounded-2xl border border-line-strong bg-surface-2/80 px-5 py-4 text-left shadow-[0_20px_60px_-30px_var(--violet-500)] transition-all duration-300 hover:border-accent/40 hover:bg-surface-3"
    >
      <Search className="size-5 text-accent-ink" strokeWidth={1.75} aria-hidden />
      <span className="flex-1 text-[16px] text-ink-faint transition-colors group-hover:text-ink-muted">
        Ask your memories — “the round we almost lost”
      </span>
      <kbd className="hidden rounded-md border border-line bg-surface-3 px-2 py-0.5 font-mono text-[12px] text-ink-faint sm:block">
        ⌘K
      </kbd>
    </button>
  );
}
