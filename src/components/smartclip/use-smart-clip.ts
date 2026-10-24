"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Client types mirror src/server/smartclip/actions.ts (no paths).

export type SignalNote = { ok: boolean; note: string | null };
export type Analysis = {
  status: "none" | "queued" | "running" | "done" | "failed";
  stage: string | null;
  error: string | null;
  finishedAt: number | null;
  hasAudio: boolean | null;
  signals: Record<"audio" | "scenes" | "speech" | "vision", SignalNote> | null;
  markers: Array<{ kind: "loudness_peak" | "loudness_jump" | "scene_change" | "silence"; startMs: number; endMs: number }>;
  counts: { peaks: number; jumps: number; scenes: number; silences: number; keyframes: number };
};
export type Suggestion = {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  suggestedStartMs: number;
  suggestedEndMs: number;
  eventStartMs: number;
  eventEndMs: number;
  focusMs: number;
  score: number;
  confidence: "strong" | "moderate" | "weak";
  evidence: Array<{ kind: string; startMs: number; endMs: number; label: string; detail: string }>;
  breakdown: Array<{ rule: string; points: number }>;
  uncertainty: string;
  speech: Array<{ startMs: number; endMs: number; text: string; nearEvent: boolean }>;
  status: "suggested" | "accepted" | "dismissed";
  saveStatus: "saving" | "saved" | "failed" | null;
  saveError: string | null;
  savedRecordingId: string | null;
  savedReady: boolean;
  thumbUrl: string | null;
};
export type Transcript = {
  status: "none" | "queued" | "running" | "done" | "failed";
  stage: string | null;
  error: string | null;
  finishedAt: number | null;
  hasAudio: boolean | null;
  model: string | null;
  language: string | null;
  voicedMs: number | null;
  setup: { available: boolean; reason: string | null };
  segments: Array<{ id: string; startMs: number; endMs: number; text: string; flagged: boolean }>;
};
export type SmartClipState = { workerOnline: boolean; analysis: Analysis; suggestions: Suggestion[]; transcript: Transcript };

const HEADERS = { "Content-Type": "application/json", "x-metal-action": "1" };

/** Polls while analysis or a save is in flight; otherwise loads once. */
export function useSmartClip(recordingId: string) {
  const [state, setState] = useState<SmartClipState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/recordings/${recordingId}/analysis`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as SmartClipState;
      busyRef.current =
        next.analysis.status === "queued" ||
        next.analysis.status === "running" ||
        next.transcript.status === "queued" ||
        next.transcript.status === "running" ||
        next.suggestions.some((s) => s.saveStatus === "saving" || (s.saveStatus === "saved" && !s.savedReady));
      setState(next);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [recordingId]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (!document.hidden) await load();
      if (alive) timer = setTimeout(tick, busyRef.current ? 1500 : 15_000);
    };
    let timer = setTimeout(tick, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [load]);

  async function send(url: string, method: string, body?: unknown): Promise<string | null> {
    try {
      const res = await fetch(url, { method, headers: HEADERS, body: body === undefined ? undefined : JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      busyRef.current = true;
      await load();
      return res.ok ? null : (json.error ?? `Failed (${res.status})`);
    } catch {
      return "Couldn’t reach the METAL server.";
    }
  }

  return {
    state,
    loadError,
    analyze: () => send(`/api/recordings/${recordingId}/analysis`, "POST"),
    transcribe: () => send(`/api/recordings/${recordingId}/transcript`, "POST"),
    flagLine: (segmentId: string, flagged: boolean) => send(`/api/transcript/${segmentId}`, "PATCH", { flagged }),
    act: (id: string, body: { action: "accept" | "dismiss" | "restore" | "retry" } | { action: "adjust"; startMs: number; endMs: number }) => send(`/api/clips/${id}`, "PATCH", body),
  };
}
