"use client";

import { Eye, LoaderCircle, Lock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Client mirror of VisualIndexView (src/server/visual/indexer.ts).
type View = {
  status: "none" | "queued" | "running" | "done" | "failed";
  stage: string | null;
  error: string | null;
  frameCount: number | null;
  intervalMs: number | null;
  model: string | null;
  outdated: boolean;
  timing: { extractMs: number | null; embedMs: number | null };
  setup: { available: boolean; reason: string | null };
};

const STAGE: Record<string, string> = { frames: "Sampling frames", embedding: "Embedding frames" };
const secs = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);

/** Opt-in local visual index (CLIP) so Recall can find what a scene looked like. */
export function VisualIndexPanel({ recordingId, workerOnline }: { recordingId: string; workerOnline: boolean }) {
  const [v, setV] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      fetch(`/api/recordings/${recordingId}/visual`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: View | null) => d && setV(d))
        .catch(() => {}),
    [recordingId],
  );
  const running = v?.status === "queued" || v?.status === "running";
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [running, load]);

  async function start(force: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/recordings/${recordingId}/visual${force ? "?force=1" : ""}`, { method: "POST", headers: { "x-metal-action": "1" } }).catch(() => null);
    if (!res?.ok) setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn’t start visual indexing.");
    await load();
    setBusy(false);
  }

  if (!v) return null;
  const canRun = v.setup.available && !running && !busy;
  return (
    <section aria-labelledby="visual-heading" className="mt-6 overflow-hidden rounded-3xl border border-line bg-surface-2/60">
      <header className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h2 id="visual-heading" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <Eye className="size-4 text-accent-ink" aria-hidden /> Visual search
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted" aria-live="polite">
            {v.status === "none" && (v.setup.available ? "Index what this recording looks like, so Recall can find scenes by description — even when nobody speaks." : v.setup.reason)}
            {running && (
              <span className="inline-flex items-center gap-2 text-accent-ink">
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                {!workerOnline ? "Waiting for the background worker (npm run worker)…" : v.status === "queued" ? "Waiting to start…" : `${STAGE[v.stage ?? ""] ?? "Indexing"}…`}
              </span>
            )}
            {v.status === "failed" && <span className="text-danger">{v.error ?? "Visual indexing failed."}</span>}
            {v.status === "done" && (
              <>
                {v.frameCount} frame{v.frameCount === 1 ? "" : "s"}, one every {secs(v.intervalMs)} plus scene cuts · {v.model} · took {secs((v.timing.extractMs ?? 0) + (v.timing.embedMs ?? 0))}.{" "}
                <Link href="/recall" className="font-medium text-accent-ink hover:text-white">Search in Recall →</Link>
                {v.outdated && <span className="block text-warn">Indexed with an older version — re-index to use the current model.</span>}
              </>
            )}
          </p>
          {error && <p role="alert" className="mt-1 text-[12.5px] text-danger">{error}</p>}
        </div>
        {(v.status === "none" || v.status === "failed") && (
          <Button onClick={() => start(false)} disabled={!canRun}>
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {v.status === "failed" ? "Try again" : "Index visuals"}
          </Button>
        )}
        {v.status === "done" && (
          <Button variant="ghost" size="sm" onClick={() => start(true)} disabled={!canRun}>
            <RotateCcw className="size-3.5" aria-hidden /> Re-index
          </Button>
        )}
      </header>
      {v.status === "none" && v.setup.available && (
        <p className="flex items-start gap-2 border-t border-line px-5 py-4 text-[12.5px] leading-relaxed text-ink-faint">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Runs on this computer with a local CLIP model; frames never leave it. Matches are approximate — they show scenes that look similar, not proof of what happened.
        </p>
      )}
    </section>
  );
}
