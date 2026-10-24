"use client";

import { useEffect, useState } from "react";
import { HOTKEY_ACTIONS, hotkeyFromKey, hotkeyProblem, type HotkeyAction } from "@/lib/capture/settings";
import { Button } from "@/components/ui/button";
import { Hotkey } from "./kbd";

/** One hotkey row: shows the binding, records a new one on request. */
export function HotkeyField({
  action,
  hotkeys,
  onChange,
}: {
  action: HotkeyAction;
  hotkeys: Record<HotkeyAction, string>;
  onChange: (accelerator: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = HOTKEY_ACTIONS[action];
  const errorId = `hotkey-${action}-error`;

  useEffect(() => {
    if (!recording) return;
    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const result = hotkeyFromKey(e);
      if (result.status === "pending") return;
      if (result.status === "invalid") {
        setError(result.reason);
        return;
      }
      const problem = hotkeyProblem(hotkeys, action, result.accelerator);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setRecording(false);
      onChange(result.accelerator);
    }
    // Capture phase so the command palette and page shortcuts don't fire meanwhile.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, hotkeys, action, onChange]);

  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-ink">{meta.label}</p>
        <p className="text-[12.5px] text-ink-faint">{meta.hint}</p>
      </div>
      <div className="flex items-center gap-3">
        {recording ? (
          <span className="text-[12.5px] text-accent-ink" aria-live="polite">
            Press a shortcut… <span className="text-ink-faint">(Esc to cancel)</span>
          </span>
        ) : (
          <Hotkey accelerator={hotkeys[action]} />
        )}
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={recording}
          aria-describedby={error ? errorId : undefined}
          aria-label={recording ? `Cancel changing ${meta.label} shortcut` : `Change ${meta.label} shortcut`}
          onClick={() => {
            setError(null);
            setRecording((r) => !r);
          }}
        >
          {recording ? "Cancel" : "Change"}
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-[12.5px] text-danger sm:basis-full">
          {error}
        </p>
      )}
    </div>
  );
}
