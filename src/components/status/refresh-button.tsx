"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/cn";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface-3 px-4 text-[14px] font-medium text-ink transition-colors hover:bg-surface-4 disabled:opacity-60"
    >
      <RotateCw
        className={cn("size-4", pending && "animate-spin")}
        strokeWidth={1.75}
        aria-hidden
      />
      {pending ? "Checking…" : "Re-check"}
    </button>
  );
}
