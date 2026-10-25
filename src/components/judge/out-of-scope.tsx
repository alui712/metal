import Link from "next/link";
import { cn } from "@/lib/cn";

/** Shown in judge mode when a URL points outside the prepared demo. Never falls back to other content. */
export function JudgeOutOfScope({ what, href, fullscreen = false }: { what: string; href: string; fullscreen?: boolean }) {
  return (
    <div className={cn("grid place-items-center p-6 text-center", fullscreen ? "fixed inset-0 z-50 bg-black" : "min-h-[50vh]")}>
      <div className="max-w-md">
        <p className="text-[17px] font-medium text-ink">This {what} isn’t part of the prepared demo</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
          The guided demo only shows approved recordings. Use the guide to return to the demo, or open this {what} in the full app.
        </p>
        <div className="mt-5 flex justify-center gap-4 text-[13px] font-medium">
          <Link href="/showcase" className="text-accent-ink hover:text-white">Return to the demo</Link>
          <Link href={href} className="text-ink-muted hover:text-ink">Leave the demo: open in the full app</Link>
        </div>
      </div>
    </div>
  );
}
