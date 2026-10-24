"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, History, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { getMemoryRepository } from "@/lib/memory/repository";
import { primaryNav, secondaryNav, showcaseNav } from "./nav-items";

const repo = getMemoryRepository();

const OPEN_EVENT = "metal:open-command-palette";

/** Opens the palette from anywhere (e.g. the sidebar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type Action = {
  id: string;
  label: string;
  hint: string;
  icon: typeof Search;
  run: () => void;
};

export function CommandPalette() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const actions = useMemo<Action[]>(() => {
    const q = query.trim();
    const go = (href: string) => () => {
      router.push(href);
      close();
    };
    const navActions: Action[] = [...primaryNav, ...secondaryNav, showcaseNav]
      .filter(
        (item) =>
          !q ||
          `${item.label} ${item.hint}`.toLowerCase().includes(q.toLowerCase()),
      )
      .map((item) => ({
        id: item.href,
        label: item.label,
        hint: item.hint,
        icon: item.icon,
        run: go(item.href),
      }));
    const sessionActions: Action[] = repo
      .sessions()
      .filter((s) => q && `${s.title} ${repo.game(s.gameId)?.name}`.toLowerCase().includes(q.toLowerCase()))
      .map((s) => ({
        id: `session:${s.id}`,
        label: s.title,
        hint: "Session",
        icon: History,
        run: go(`/sessions/${s.id}`),
      }));
    if (!q) return navActions;
    return [
      {
        id: "search",
        label: `Search memories for “${q}”`,
        hint: "Recall",
        icon: Sparkles,
        run: go(`/recall?q=${encodeURIComponent(q)}`),
      },
      ...sessionActions,
      ...navActions,
    ];
  }, [query, router, close]);

  const active = Math.min(activeIndex, Math.max(actions.length - 1, 0));

  // Keep the keyboard-highlighted option visible in the scrolling list.
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((active + 1) % Math.max(actions.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((active - 1 + actions.length) % Math.max(actions.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      actions[active]?.run();
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className="glass fixed left-1/2 top-[14vh] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line-strong shadow-[0_40px_120px_-20px_rgb(0_0_0/0.8),0_0_0_1px_rgb(139_92_255/0.08)]"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                <div className="flex items-center gap-3 border-b border-line px-5">
                  <Search className="size-5 text-accent-ink" aria-hidden />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={onInputKeyDown}
                    placeholder="Ask your memories, or jump to…"
                    aria-label="Search or jump to"
                    role="combobox"
                    aria-expanded
                    aria-controls={listId}
                    aria-activedescendant={actions[active] ? `${listId}-${active}` : undefined}
                    className="h-16 min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink-faint"
                  />
                  <kbd className="hidden rounded-md border border-line bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-faint sm:inline">
                    esc
                  </kbd>
                </div>
                <ul id={listId} role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
                  {actions.map((action, i) => {
                    const Icon = action.icon;
                    return (
                      <li
                        key={action.id}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === active}
                        onMouseMove={() => setActiveIndex(i)}
                        onClick={action.run}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-[14px]",
                          i === active ? "bg-surface-4/80 text-ink" : "text-ink-muted",
                        )}
                      >
                        <Icon
                          className={cn("size-[18px]", i === active ? "text-accent-ink" : "text-ink-faint")}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{action.label}</span>
                        <span className="hidden max-w-[45%] truncate text-[12px] text-ink-faint sm:block">{action.hint}</span>
                        {i === active && (
                          <CornerDownLeft className="size-3.5 text-ink-faint" aria-hidden />
                        )}
                      </li>
                    );
                  })}
                  {actions.length === 0 && (
                    <li className="px-3 py-8 text-center text-[14px] text-ink-faint">
                      Nothing matches “{query}”.
                    </li>
                  )}
                </ul>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
