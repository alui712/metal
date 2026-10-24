"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Explicitly starts local analysis for one recording. */
export function AnalyzeButton({ recordingId }: { recordingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/recordings/${recordingId}/analysis`, { method: "POST", headers: { "x-metal-action": "1" } }).catch(() => null);
          if (!res?.ok) setError((await res?.json().catch(() => null))?.error ?? "Couldn’t start analysis.");
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />} Find moments
      </Button>
      {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}
