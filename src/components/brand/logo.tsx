import { useId } from "react";
import { cn } from "@/lib/cn";

/** METAL mark: a faceted ingot with a cut-through "M" channel. Original artwork. */
export function LogoMark({ className }: { className?: string }) {
  // Unique per instance: a duplicate id inside a hidden subtree (e.g. the
  // desktop sidebar on mobile) would make every mark render blank.
  const gradientId = `metal-face-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b1ff" />
          <stop offset="0.55" stopColor="#8b5cff" />
          <stop offset="1" stopColor="#4b22c9" />
        </linearGradient>
      </defs>
      <path d="M16 2 28 9v14l-12 7L4 23V9z" fill={`url(#${gradientId})`} />
      <path
        d="M10 21V11.5l6 5 6-5V21"
        fill="none"
        stroke="#0c0c0f"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      <span className="text-[15px] font-semibold tracking-[0.22em]">METAL</span>
    </span>
  );
}
