"use client";

import { useSyncExternalStore } from "react";
import type { TourTargets } from "@/lib/judge/tour";

// Tour progress lives in sessionStorage: it follows the judge across pages and
// ends with the tab. Storage can be unavailable (private mode); then the tour
// still works for the current page view.

export type TourState = { step: number; targets: TourTargets };

const KEY = "metal:judge-tour";
const listeners = new Set<() => void>();
let raw: string | null = null;
let state: TourState | null = null;

function read(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return raw;
  }
}

function snapshot(): TourState | null {
  const next = read();
  if (next !== raw) {
    raw = next;
    try {
      const parsed = next ? (JSON.parse(next) as TourState) : null;
      // Drop state saved by an older build rather than misdescribing its stops.
      state = parsed && Number.isInteger(parsed.step) && parsed.targets && "recall" in parsed.targets && "night" in parsed.targets && "story" in parsed.targets ? parsed : null;
    } catch {
      state = null;
    }
  }
  return state;
}

function write(next: TourState | null) {
  raw = next ? JSON.stringify(next) : null;
  state = next;
  try {
    if (raw) sessionStorage.setItem(KEY, raw);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Keep the in-memory copy.
  }
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useTour(): TourState | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export const startTour = (targets: TourTargets) => write({ step: 0, targets });
export const setTourStep = (step: number) => {
  const current = snapshot();
  if (current) write({ ...current, step });
};
export const endTour = () => write(null);
