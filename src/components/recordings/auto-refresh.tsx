"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the Server Component tree on an interval while something is processing. */
export function AutoRefresh({ everyMs = 1500 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}
