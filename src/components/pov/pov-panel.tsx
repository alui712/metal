"use client";

import { AudioLines, Check, Clock, Gamepad2, LoaderCircle, Plus, RefreshCw, Upload, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { duration, formatLocalDateTime } from "@/lib/format";
import { signedSeconds } from "@/lib/pov/sync";
import type { PovCandidate, PovView } from "@/lib/pov/types";

const HEADERS = { "Content-Type": "application/json", "x-metal-action": "1" };

type View = PovView & { workerOnline: boolean };

export const SYNC_LABEL = {
  anchor: "Reference POV",
  audio: "Suggested from shared audio",
  clock: "Suggested from recording clocks",
  manual: "Lined up by hand",
} as const;

/** Recording page: this recording's POV group, and "Find other POVs" with its evidence. */
export function PovPanel({ recordingId }: { recordingId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/recordings/${recordingId}/povs`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setView((await res.json()) as View);
  }, [recordingId]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/recordings/${recordingId}/povs`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<View>) : null))
      .then((v) => alive && v && setView(v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [recordingId]);

  const running = view?.job?.status === "queued" || view?.job?.status === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [running, load]);

  async function find() {
    setError(null);
    setBusy("find");
    const res = await fetch(`/api/recordings/${recordingId}/povs`, { method: "POST", headers: HEADERS }).catch(() => null);
    if (!res?.ok) setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn’t start the search.");
    await load();
    setBusy(null);
  }

  async function pair(otherId: string, offsetMs: number, source: "clock" | "audio" | "manual", audioScore?: number | null) {
    setError(null);
    setBusy(otherId);
    const res = await fetch("/api/povs", { method: "POST", headers: HEADERS, body: JSON.stringify({ action: "pair", recordingId, otherId, offsetMs, source, audioScore: audioScore ?? null }) }).catch(() => null);
    if (!res?.ok) setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn’t pair those recordings.");
    await load();
    setBusy(null);
  }

  if (!view) return <div className="h-40 animate-pulse rounded-2xl bg-surface-2" aria-hidden />;

  const others = view.group?.members.filter((m) => m.recordingId !== recordingId) ?? [];
  const open = view.candidates.filter((c) => !c.pairedHere);
  const checked = view.checkedAt !== null;
  const me = view.group?.members.find((m) => m.recordingId === recordingId);

  return (
    <section id="povs" aria-labelledby="povs-heading" className="scroll-mt-6 overflow-hidden rounded-2xl border border-line bg-surface-2/60">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
        <Users className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="povs-heading" className="text-[14px] font-medium text-ink">
            Other POVs
          </h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-faint">The same play from another player’s recording, imported with their permission.</p>
        </div>
      </div>

      {view.group && (
        <div className="border-b border-line px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ink-faint">Synced · {view.group.members.length} POVs</p>
          <ul className="mt-2 space-y-1.5">
            {others.map((m) => (
              <li key={m.recordingId} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-ink">{m.playerName ?? m.title}</span>
                <SyncChip confirmed={m.syncConfirmed} source={m.syncSource} />
              </li>
            ))}
          </ul>
          <ButtonLink href={`/povs/${view.group.id}?rec=${recordingId}`} size="sm" className="mt-3 w-full">
            Watch synced POVs
          </ButtonLink>
          {me && !me.syncConfirmed && <p className="mt-2 text-[11.5px] text-ink-faint">Sync is a suggestion until you check it in the viewer.</p>}
        </div>
      )}

      <div className="px-4 py-3.5">
        {running ? (
          <div role="status" className="flex items-center gap-2 text-[13px] text-ink-muted">
            <LoaderCircle className="size-4 animate-spin text-accent-ink" aria-hidden />
            Comparing audio… {Math.round((view.job?.progress ?? 0) * 100)}%
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="w-full" onClick={find} disabled={busy === "find"}>
            {checked ? <RefreshCw className="size-4" aria-hidden /> : <Users className="size-4" aria-hidden />}
            {checked ? "Check again" : "Find other POVs"}
          </Button>
        )}
        {!view.workerOnline && !running && <p className="mt-2 text-[11.5px] text-warn">The worker isn’t running — start it to compare audio.</p>}
        {view.job?.status === "failed" && <p className="mt-2 text-[11.5px] text-danger">{view.job.error ?? "The search failed."}</p>}
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">Uses recording times, game tags and shared audio, all on this computer. Nothing is paired until you pair it.</p>

        {open.length > 0 && (
          <ul aria-label="Possible POVs" className="mt-3 space-y-2.5">
            {open.map((c) => (
              <Candidate key={c.recordingId} c={c} busy={busy === c.recordingId} onPair={() => pair(c.recordingId, c.suggested?.offsetMs ?? 0, c.suggested?.source ?? "manual", c.audio?.score)} />
            ))}
          </ul>
        )}

        {checked && !running && open.length === 0 && (
          <div className="mt-3 rounded-xl border border-dashed border-line-strong px-3.5 py-4 text-center">
            <p className="text-[13px] font-medium text-ink">{others.length ? "No other POVs found" : "No matching POV found"}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              No other recording overlaps this one in time{view.undatedChecked ? `, and ${view.undatedChecked} with unknown times didn’t share its audio` : ""}. Ask a teammate for their recording of the match.
            </p>
            <Link href="/import" className={buttonClass("ghost", "sm", "mt-2")}>
              <Upload className="size-4" aria-hidden /> Import a recording
            </Link>
          </div>
        )}
        {checked && open.length > 0 && view.undatedChecked > 0 && (
          <p className="mt-2 text-[11.5px] text-ink-faint">{view.undatedChecked} recording{view.undatedChecked === 1 ? "" : "s"} with unknown times didn’t share this one’s audio.</p>
        )}

        {error && (
          <p role="alert" className="mt-2 text-[12px] text-danger">
            {error}
          </p>
        )}

        {view.pairable.length > 0 && (
          <details className="group mt-3">
            <summary className="cursor-pointer list-none text-[12.5px] font-medium text-ink-muted hover:text-ink">
              <Plus className="mr-1 inline size-3.5 transition-transform group-open:rotate-45" aria-hidden />
              Pair a recording by hand
            </summary>
            <div className="mt-2 flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">Recording to pair</span>
                <select value={manual} onChange={(e) => setManual(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-surface-2 px-2 text-[12.5px] text-ink">
                  <option value="">Choose a recording…</option>
                  {view.pairable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {duration(p.durationMs)}
                      {p.recordedAt ? ` · ${formatLocalDateTime(p.recordedAt)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Button size="sm" variant="secondary" disabled={!manual || busy === manual} onClick={() => pair(manual, 0, "manual").then(() => setManual(""))}>
                Pair
              </Button>
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-faint">Starts lined up at 0:00. You’ll set the sync in the viewer.</p>
          </details>
        )}
      </div>
    </section>
  );
}

export function SyncChip({ confirmed, source, className }: { confirmed: boolean; source: keyof typeof SYNC_LABEL; className?: string }) {
  return confirmed ? (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[11px] font-medium text-ok", className)}>
      <Check className="size-3" aria-hidden /> {source === "anchor" ? "Reference" : "Sync confirmed"}
    </span>
  ) : (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border border-dashed border-line-strong px-2 py-0.5 text-[11px] font-medium text-ink-muted", className)} title={SYNC_LABEL[source]}>
      Suggested sync
    </span>
  );
}

function Candidate({ c, busy, onPair }: { c: PovCandidate; busy: boolean; onPair: () => void }) {
  const t = c.time;
  const lines: Array<{ icon: typeof Clock; text: string; strong?: boolean }> = [];
  if (t.kind === "overlap") lines.push({ icon: Clock, text: `${t.approximate ? "Probably recorded" : "Recorded"} at the same time (overlaps ${duration(t.overlapMs)})` });
  else if (t.kind === "near") lines.push({ icon: Clock, text: `Recorded ${duration(t.gapMs)} apart${t.approximate ? " (approximate times)" : ""}` });
  else lines.push({ icon: Clock, text: "Recording time unknown" });
  const a = c.audio;
  if (!a) lines.push({ icon: AudioLines, text: "Audio not compared yet" });
  else if (a.status === "reliable") lines.push({ icon: AudioLines, text: `Shared audio lines up at ${signedSeconds(a.offsetMs!)}`, strong: true });
  else if (a.status === "weak") lines.push({ icon: AudioLines, text: "Some shared audio, not conclusive" });
  else if (a.status === "none") lines.push({ icon: AudioLines, text: "No shared audio found" });
  else lines.push({ icon: AudioLines, text: a.status === "no-audio" ? "No audio to compare" : "Couldn’t compare audio" });
  if (c.sameGame && c.game) lines.push({ icon: Gamepad2, text: `Same game · ${c.game}` });

  return (
    <li className={cn("rounded-xl border p-3", c.confidence === "likely" ? "border-accent/35 bg-accent/[0.06]" : "border-line")}>
      <div className="flex items-start gap-2.5">
        {c.posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local poster
          <img src={c.posterUrl} alt="" className="aspect-video w-16 shrink-0 rounded-md object-cover ring-1 ring-line" />
        ) : (
          <span className="aspect-video w-16 shrink-0 rounded-md bg-surface-3 ring-1 ring-line" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{c.playerName ?? c.title}</p>
          <p className={cn("mt-0.5 text-[11px] font-medium", c.confidence === "likely" ? "text-accent-ink" : "text-ink-faint")}>
            {c.confidence === "likely" ? "Likely the same match" : "Possible — not confirmed"}
          </p>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {lines.map(({ icon: Icon, text, strong }) => (
          <li key={text} className={cn("flex items-start gap-1.5 text-[12px]", strong ? "text-ink" : "text-ink-muted")}>
            <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {text}
          </li>
        ))}
      </ul>
      <Button size="sm" variant={c.confidence === "likely" ? "primary" : "secondary"} className="mt-2.5 w-full" disabled={busy} onClick={onPair}>
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
        Pair as another POV
      </Button>
    </li>
  );
}
