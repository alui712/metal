"use client";

import { useSyncExternalStore } from "react";

// Shared poller for watched-folder state (every 2 s while subscribed and visible).

export type FolderState = "pending" | "scanning" | "watching" | "unavailable" | "denied" | "paused";

export type FolderView = {
  id: string;
  kind: "obs" | "medal" | "generic";
  label: string;
  displayPath: string;
  status: "active" | "paused";
  state: FolderState;
  error: string | null;
  lastScanAt: number | null;
  rescanPending: boolean;
  counts: { found: number; imported: number; processing: number; failed: number; invalid: number; missing: number };
  problems: Array<{ name: string; error: string }>;
  recentRecordingIds: string[];
};

export type FoldersSnapshot = { workerOnline: boolean; obsFolder: string | null; folders: FolderView[]; fetchedAt: number };

let snapshot: FoldersSnapshot | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

async function poll() {
  if (inflight || (typeof document !== "undefined" && document.hidden)) return;
  inflight = true;
  try {
    const res = await fetch("/api/sources/folders", { cache: "no-store" });
    if (res.ok) {
      snapshot = { ...(await res.json()), fetchedAt: Date.now() };
      listeners.forEach((l) => l());
    }
  } catch {
    /* keep the last snapshot */
  } finally {
    inflight = false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    void poll();
    timer = setInterval(poll, 2000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useFolders(): FoldersSnapshot | null {
  return useSyncExternalStore(subscribe, () => snapshot, () => null);
}

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

async function call<T>(url: string, method: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-metal-action": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    void poll();
    return res.ok ? { ok: true, ...json } : { ok: false, error: json.error ?? `Failed (${res.status})` };
  } catch {
    return { ok: false, error: "Couldn’t reach the METAL server." };
  }
}

export const addFolder = (body: { path?: string; kind: FolderView["kind"]; useObsFolder?: boolean }) => call<{ id: string }>("/api/sources/folders", "POST", body);
export const folderAction = (id: string, action: "pause" | "resume" | "rescan" | "retry") => call(`/api/sources/folders/${id}`, "PATCH", { action });
export const removeFolder = (id: string) => call(`/api/sources/folders/${id}`, "DELETE");
export const pickFolder = () => call<{ path?: string; cancelled?: boolean }>("/api/sources/folders/pick", "POST");
