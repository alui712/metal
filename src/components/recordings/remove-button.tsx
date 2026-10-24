"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Two-step remove: METAL deletes its own copy only. */
export function RemoveRecordingButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function remove() {
    setState("busy");
    const res = await fetch(`/api/recordings/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      router.push("/library");
      router.refresh();
    } else setState("error");
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="size-4" aria-hidden /> Remove from METAL
      </Button>
    );
  }
  return (
    <div role="group" aria-label={`Remove ${title}?`} className="flex flex-wrap items-center gap-2">
      <span className="text-[12.5px] text-ink-muted">Deletes METAL’s copy. Your original file elsewhere isn’t touched.</span>
      <Button size="sm" className="bg-danger/90 shadow-none hover:bg-danger" onClick={remove} disabled={state === "busy"} autoFocus>
        {state === "busy" ? "Removing…" : "Remove"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={state === "busy"}>
        Cancel
      </Button>
      {state === "error" && <span role="alert" className="text-[12.5px] text-danger">Couldn’t remove it. Try again.</span>}
    </div>
  );
}
