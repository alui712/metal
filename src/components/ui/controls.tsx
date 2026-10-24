"use client";

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Toggleable filter pill. */
export function FilterChip({
  pressed,
  onPressedChange,
  children,
  className,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-200",
        pressed
          ? "border-accent/50 bg-accent/15 text-accent-ink"
          : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Single-choice segmented control with a sliding indicator (radiogroup). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  label: string;
  className?: string;
}) {
  const layoutId = useId();
  function onKeyDown(e: React.KeyboardEvent) {
    const i = options.findIndex((o) => o.value === value);
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = options[(i + delta + options.length) % options.length];
    onChange(next.value);
    const group = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("inline-flex rounded-xl border border-line bg-surface-2 p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
              active ? "text-ink" : "text-ink-faint hover:text-ink-muted",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg bg-surface-4 shadow-[0_1px_0_rgb(255_255_255/0.06)_inset]"
                transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-200",
        checked ? "border-accent/60 bg-accent" : "border-line-strong bg-surface-4",
      )}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 size-[18px] rounded-full bg-white shadow"
        animate={{ x: checked ? 16 : 0 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
      />
    </button>
  );
}
