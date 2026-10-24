"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, parseSettings, type CaptureSettings } from "@/lib/capture/settings";

// Per-device preferences in localStorage until the local server persists
// them alongside the OBS adapter (Phase 3). Storage can be unavailable (private mode), so every access
// is guarded and the defaults always render.

const KEY = "metal.capture-settings.v1";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: CaptureSettings } = { raw: null, value: DEFAULT_SETTINGS };

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): CaptureSettings {
  const raw = read();
  if (raw !== cache.raw) cache = { raw, value: parseSettings(raw) };
  return cache.value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function saveCaptureSettings(next: CaptureSettings): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return false;
  }
  listeners.forEach((l) => l());
  return true;
}

export function useCaptureSettings(): CaptureSettings {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_SETTINGS);
}
