import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-[var(--ease-out)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[0_1px_0_rgb(255_255_255/0.18)_inset,0_10px_30px_-12px_var(--violet-500)] hover:bg-accent-strong",
  secondary: "border border-line-strong bg-surface-3/80 text-ink hover:border-white/20 hover:bg-surface-4",
  ghost: "text-ink-muted hover:bg-surface-3 hover:text-ink",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-11 px-5 text-[14px]",
  lg: "h-13 px-6 text-[15px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** Square icon-only button. Always pass an aria-label. */
export function IconButton({
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { "aria-label": string }) {
  return (
    <button
      type={type}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
