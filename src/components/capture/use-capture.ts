"use client";

import { useSyncExternalStore } from "react";
import type { CaptureView } from "@/lib/capture/status";
import type { LibraryRecording } from "@/lib/recordings/types";

// One shared poller for every component that shows capture state. Polls
// /api/capture every second while anything is subscribed and the tab is
// visible; null until the first answer (so nothing claims a state early).

export type CaptureSnapshot = {
  state: CaptureView;
  config: { host: string; port: number; hasPassword: boolean; enabled: boolean; configured: boolean };
  lastClipRecording: LibraryRecording | null;
  fetchedAt: number;
};

let snapshot: CaptureSnapshot | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

async function poll() {
  if (inflight || (typeof document !== "undefined" && document.hidden)) return;
  inflight = true;
  try {
    const res = await fetch("/api/capture", { cache: "no-store" });
    if (res.ok) {
      snapshot = { ...(await res.json()), fetchedAt: Date.now() };
      listeners.forEach((l) => l());
    }
  } catch {
    /* server restarting; keep the last snapshot */
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
