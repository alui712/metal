"use client";

import { useSyncExternalStore } from "react";
import { nextPoll, type Lost, type PollResult } from "@/lib/capture/poll";
import { INITIAL_CAPTURE, type CaptureView } from "@/lib/capture/status";
import type { LibraryRecording } from "@/lib/recordings/types";

// One shared poller for every component that shows capture state. Polls
// /api/capture every second while anything is subscribed and the tab is
// visible; null until the first answer (so nothing claims a state early).

export type CaptureSnapshot = {
  state: CaptureView;
  config: { host: string; port: number; hasPassword: boolean; enabled: boolean; configured: boolean };
  lastClipRecording: LibraryRecording | null;
  /** When the last answer arrived. */
  fetchedAt: number;
  /** Set after several failed polls: the shown state is stale and controls must not act on it. */
  lost: Lost | null;
};

let snapshot: CaptureSnapshot | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;
let failures = 0;

const EMPTY = () => ({
  state: INITIAL_CAPTURE,
  config: { host: "", port: 0, hasPassword: false, enabled: false, configured: false },
  lastClipRecording: null,
});

function apply(result: PollResult) {
  const next = nextPoll<CaptureSnapshot>(snapshot, failures, result, Date.now(), EMPTY);
  snapshot = next.snapshot;
  failures = next.failures;
  if (next.changed) listeners.forEach((l) => l());
}

async function poll() {
  if (inflight || (typeof document !== "undefined" && document.hidden)) return;
  inflight = true;
  try {
    const res = await fetch("/api/capture", { cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok && body && typeof body === "object") apply({ ok: true, body });
    else apply({ ok: false, message: body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `server error ${res.status}` });
  } catch {
    // Brief failures are normal while the server restarts; nextPoll decides when it's lost.
    apply({ ok: false, message: "The METAL server isn’t responding." });
  } finally {
    inflight = false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    void poll();
    timer = setInterval(poll, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useCapture(): CaptureSnapshot | null {
  return useSyncExternalStore(subscribe, () => snapshot, () => null);
}

export const refreshCapture = poll;

const HEADERS = { "Content-Type": "application/json", "x-metal-action": "1" };

export async function captureCommand(action: string, payload: Record<string, unknown> = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/capture/command", { method: "POST", headers: HEADERS, body: JSON.stringify({ action, ...payload }) });
    const body = await res.json().catch(() => ({}));
    void poll();
    return res.ok ? { ok: true } : { ok: false, error: body.error ?? `Failed (${res.status})` };
  } catch {
    return { ok: false, error: "Couldn’t reach the METAL server." };
  }
}

export async function saveObsConfig(body: { host: string; port: number; password?: string | null; enabled: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/capture/config", { method: "PUT", headers: HEADERS, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    void poll();
    return res.ok ? { ok: true } : { ok: false, error: json.error ?? `Failed (${res.status})` };
  } catch {
    return { ok: false, error: "Couldn’t reach the METAL server." };
  }
}
