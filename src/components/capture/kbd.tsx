import { hotkeyTokens } from "@/lib/capture/settings";
import { cn } from "@/lib/cn";

export function Hotkey({ accelerator, className }: { accelerator: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span className="sr-only">{accelerator.replace("CmdOrCtrl", "Control or Command")}</span>
      {hotkeyTokens(accelerator).map((t) => (
        <kbd key={t} aria-hidden className="rounded-md border border-line-strong bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
          {t}
        </kbd>
      ))}
    </span>
  );
}
