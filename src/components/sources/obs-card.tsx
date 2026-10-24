"use client";

import { ExternalLink, LoaderCircle, Radio } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { saveObsConfig, useCapture } from "@/components/capture/use-capture";
import { Field, SourceCard, Steps, inputClass, type SourceState } from "./source-card";

/** OBS connection: live status plus host/port/password. The password is write-only. */
export function ObsCard() {
  const snap = useCapture();
  const lost = snap?.lost ?? null;
  // While the server isn't answering, show that rather than its last (stale) state.
  const s = lost ? undefined : snap?.state;
  const cfg = snap?.config;
  const [draft, setDraft] = useState<{ host: string; port: string } | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host = draft?.host ?? cfg?.host ?? "127.0.0.1";
  const port = draft?.port ?? String(cfg?.port ?? 4455);
  const state: SourceState = lost ? "error" : !s ? "checking" : s.connection === "not-configured" ? "not-connected" : s.connection;

  async function save(enabled: boolean) {
    setBusy(true);
    setError(null);
    const res = await saveObsConfig({ host, port: Number(port), enabled, ...(password ? { password } : {}) });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setPassword("");
      setDraft(null);
    }
  }

  return (
    <SourceCard
      id="obs"
      icon={Radio}
      title="OBS Studio"
      state={state}
      description="The capture engine. METAL tells OBS when to record and save clips through its built-in WebSocket server — OBS does the recording."
      className="lg:row-span-2"
    >
      <h3 className="mb-3 text-[12px] font-medium uppercase tracking-[0.18em] text-ink-faint">Set up OBS</h3>
      <Steps
        steps={[
          <>
            Install{" "}
            <a href="https://obsproject.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-ink underline-offset-4 hover:underline">
              OBS Studio 28 or newer <ExternalLink className="size-3" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>{" "}
            and keep it open while you play.
          </>,
          <>In OBS, open <b className="font-medium text-ink">Tools → WebSocket Server Settings</b>, turn on <b className="font-medium text-ink">Enable WebSocket server</b>, keep authentication on, and copy the password (<b className="font-medium text-ink">Show Connect Info</b>).</>,
          <>Under <b className="font-medium text-ink">Settings → Output</b>, enable the <b className="font-medium text-ink">Replay Buffer</b>. Use MKV or MP4 as the recording format.</>,
          <>For in-game clipping, set a <b className="font-medium text-ink">Save Replay</b> key in <b className="font-medium text-ink">Settings → Hotkeys</b>. A browser can’t hear keys while a game has focus; OBS can — and METAL imports clips saved either way.</>,
        ]}
      />
      <form
        aria-label="OBS connection"
        className="mt-7 grid gap-4 rounded-2xl border border-line bg-surface/50 p-4 sm:grid-cols-[1fr_7rem]"
        onSubmit={(e) => {
          e.preventDefault();
          void save(true);
        }}
      >
        <Field label="Host" htmlFor="obs-host" hint="This computer only.">
          <input id="obs-host" className={inputClass} value={host} onChange={(e) => setDraft({ host: e.target.value, port })} autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Port" htmlFor="obs-port">
          <input id="obs-port" className={inputClass} value={port} onChange={(e) => setDraft({ host, port: e.target.value })} inputMode="numeric" autoComplete="off" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Password" htmlFor="obs-password" hint="Kept by METAL’s local server. It’s never shown again or sent back to the browser.">
            <input
              id="obs-password"
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={cfg?.hasPassword ? "Saved — leave blank to keep it" : "From OBS → Show Connect Info"}
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {cfg?.enabled ? "Save & reconnect" : "Connect to OBS"}
          </Button>
          {cfg?.enabled && (
            <Button type="button" variant="ghost" onClick={() => save(false)} disabled={busy}>
              Disconnect
            </Button>
          )}
        </div>
      </form>
      <div className="mt-3 space-y-1 text-[12.5px] leading-relaxed" aria-live="polite">
        {error && <p role="alert" className="text-danger">{error}</p>}
        {lost && <p className="text-danger">Lost contact with the METAL server: {lost.message} OBS status is unknown until it answers again.</p>}
        {s?.connection === "connected" && (
          <p className="text-ok">
            Connected to OBS {s.obsVersion}. {s.replayAvailable ? "Replay buffer available." : "Replay buffer is off in OBS — enable it to save clips."}
          </p>
        )}
        {s?.connection === "error" && <p className="text-danger">{s.error}</p>}
        {s?.connection === "connecting" && <p className="text-warn">Connecting to OBS…</p>}
        {s?.connection === "worker-offline" && <p className="text-warn">The background worker isn’t running, so METAL can’t reach OBS. Start it with npm run worker.</p>}
      </div>
    </SourceCard>
  );
}
