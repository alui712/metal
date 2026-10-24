import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { audioEvents, clipSuggestions, frames, recordingAnalysis, recordings, recordingTranscripts } from "../db/schema";
import { speechProvider } from "../analysis/providers";
import { readSegments } from "../analysis/transcribe";
import { enqueueJob } from "../jobs/queue";

// Smart Clip decisions and client-safe views (no paths).

export type SuggestionView = {
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
  /** Plain-language limit of what the evidence shows. */
  uncertainty: string;
  /**
   * Transcribed speech inside the clip — what was said, shown as context.
   * Never used for scoring or titles. `nearEvent`: within 2 s of a measured signal.
   */
  speech: Array<{ startMs: number; endMs: number; text: string; nearEvent: boolean }>;
  status: "suggested" | "accepted" | "dismissed";
  saveStatus: "saving" | "saved" | "failed" | null;
  saveError: string | null;
  savedRecordingId: string | null;
  savedReady: boolean;
  thumbUrl: string | null;
};

export type AnalysisView = {
  status: "none" | "queued" | "running" | "done" | "failed";
  stage: string | null;
  error: string | null;
  finishedAt: number | null;
  hasAudio: boolean | null;
  signals: Record<"audio" | "scenes" | "speech" | "vision", { ok: boolean; note: string | null }> | null;
  markers: Array<{ kind: "loudness_peak" | "loudness_jump" | "scene_change" | "silence"; startMs: number; endMs: number }>;
  counts: { peaks: number; jumps: number; scenes: number; silences: number; keyframes: number };
};

function uncertaintyFor(kinds: Set<string>): string {
  const audio = kinds.has("loudness_peak") || kinds.has("loudness_jump");
  const visual = kinds.has("scene_change") || kinds.has("visual_burst");
  if (audio && visual) return "Based on loudness and picture changes. METAL can’t hear words or see what happened — preview before saving.";
  if (audio) return "Based on loudness only. METAL can’t tell what the sound was — preview before saving.";
  return "Based on picture changes only (no audio signal). This may be a menu or camera cut — preview before saving.";
}

export function listSuggestions(db: Db, recordingId: string): SuggestionView[] {
  const rows = db.select().from(clipSuggestions).where(eq(clipSuggestions.recordingId, recordingId)).orderBy(asc(clipSuggestions.startMs)).all();
  if (!rows.length) return [];
  const frameRows = db.select({ id: frames.id, tMs: frames.tMs }).from(frames).where(eq(frames.recordingId, recordingId)).all();
  const segments = readSegments(db, recordingId);
  const savedIds = rows.flatMap((r) => (r.savedRecordingId ? [r.savedRecordingId] : []));
  const saved = savedIds.length ? db.select({ id: recordings.id, status: recordings.status }).from(recordings).where(inArray(recordings.id, savedIds)).all() : [];
  return rows.map((r) => {
    const ev = JSON.parse(r.evidenceJson) as { focusMs: number; items: SuggestionView["evidence"] };
    const near = frameRows.length ? frameRows.reduce((a, b) => (Math.abs(b.tMs - ev.focusMs) < Math.abs(a.tMs - ev.focusMs) ? b : a)) : null;
    const savedRec = saved.find((x) => x.id === r.savedRecordingId);
    const speech = segments
      .filter((g) => g.endMs > r.startMs && g.startMs < r.endMs)
      .slice(0, 6)
      .map((g) => ({
        startMs: g.startMs,
        endMs: g.endMs,
        text: g.text,
        nearEvent: ev.items.some((i) => g.endMs >= i.startMs - 2000 && g.startMs <= i.endMs + 2000),
      }));
    const uncertainty = uncertaintyFor(new Set(ev.items.map((i) => i.kind)));
    return {
      id: r.id,
      title: r.title,
      startMs: r.startMs,
      endMs: r.endMs,
      suggestedStartMs: r.suggestedStartMs,
      suggestedEndMs: r.suggestedEndMs,
      eventStartMs: r.eventStartMs,
      eventEndMs: r.eventEndMs,
      focusMs: ev.focusMs,
      score: r.score,
      confidence: r.confidence,
      evidence: ev.items,
      breakdown: JSON.parse(r.breakdownJson),
      uncertainty: speech.length ? `${uncertainty} The transcript shows what was said, not what happened on screen.` : uncertainty,
      speech,
      status: r.status,
      saveStatus: r.saveStatus,
      saveError: r.saveError,
      savedRecordingId: savedRec ? r.savedRecordingId : null,
      savedReady: savedRec?.status === "ready" || savedRec?.status === "analyzed",
      thumbUrl: near ? `/api/frames/${near.id}` : null,
    };
  });
}

const parseSignal = (v: unknown) => {
  const s = typeof v === "string" ? v : "";
  return { ok: s === "ok", note: s === "ok" ? null : s.replace(/^unavailable:\s*/, "") || null };
};

/** Speech comes from the separate transcription step, so it's read live rather than from the analysis snapshot. */
function speechSignal(db: Db, recordingId: string) {
  const t = db.select({ status: recordingTranscripts.status, n: recordingTranscripts.segmentCount, hasAudio: recordingTranscripts.hasAudio }).from(recordingTranscripts).where(eq(recordingTranscripts.recordingId, recordingId)).get();
  if (t?.status === "done") {
    if (t.n) return { ok: true, note: `${t.n} transcript segment${t.n === 1 ? "" : "s"}` };
    return { ok: false, note: t.hasAudio === false ? "No audio track" : "No speech detected" };
  }
  const p = speechProvider();
  return { ok: false, note: p.available ? "Not transcribed yet" : p.reason };
}

export function analysisView(db: Db, recordingId: string): AnalysisView {
  const a = db.select().from(recordingAnalysis).where(eq(recordingAnalysis.recordingId, recordingId)).get();
  const ev = a?.status === "done" ? db.select({ kind: audioEvents.kind, startMs: audioEvents.startMs, endMs: audioEvents.endMs }).from(audioEvents).where(eq(audioEvents.recordingId, recordingId)).orderBy(asc(audioEvents.startMs)).all() : [];
  const keyframes = a?.status === "done" ? db.select({ id: frames.id }).from(frames).where(eq(frames.recordingId, recordingId)).all().length : 0;
  const signals = a?.status === "done" ? (JSON.parse(a.signalsJson) as Record<string, unknown>) : null;
  return {
    status: a?.status ?? "none",
    stage: a?.stage ?? null,
    error: a?.error ?? null,
    finishedAt: a?.finishedAt ?? null,
    hasAudio: a?.hasAudio ?? null,
    signals: signals ? { audio: parseSignal(signals.audio), scenes: parseSignal(signals.scenes), speech: speechSignal(db, recordingId), vision: parseSignal(signals.vision) } : null,
    markers: ev.slice(0, 400),
    counts: {
      peaks: ev.filter((e) => e.kind === "loudness_peak").length,
      jumps: ev.filter((e) => e.kind === "loudness_jump").length,
      scenes: ev.filter((e) => e.kind === "scene_change").length,
      silences: ev.filter((e) => e.kind === "silence").length,
      keyframes,
    },
  };
}

export type ClipAction = { action: "accept" | "dismiss" | "restore" | "retry" } | { action: "adjust"; startMs: number; endMs: number };

/** Applies a user decision. Returns an error message, or null on success. */
export function applyClipAction(db: Db, id: string, a: ClipAction): string | null {
  const s = db.select().from(clipSuggestions).where(eq(clipSuggestions.id, id)).get();
  if (!s) return "not-found";
  const locked = s.saveStatus === "saving" || s.saveStatus === "saved";
  const set = (v: Partial<typeof clipSuggestions.$inferInsert>) => db.update(clipSuggestions).set(v).where(eq(clipSuggestions.id, id)).run();
  switch (a.action) {
    case "accept":
    case "retry": {
      if (s.saveStatus === "saving" || s.saveStatus === "saved") return null; // already in progress/done: idempotent
      const job = enqueueJob(db, { kind: "clip-export", recordingId: s.recordingId, payload: { suggestionId: id }, maxAttempts: 2 });
      set({ status: "accepted", decidedAt: Date.now(), saveStatus: "saving", saveError: null, saveJobId: job.id });
      return null;
    }
    case "dismiss":
      if (locked) return "This clip is already saved. Remove it from the Library instead.";
      set({ status: "dismissed", decidedAt: Date.now() });
      return null;
    case "restore":
      if (locked) return null;
      set({ status: "suggested", decidedAt: null, saveStatus: null, saveError: null });
      return null;
    case "adjust": {
      if (locked) return "Saved clips can’t be adjusted. Restore a new suggestion instead.";
      const rec = db.select({ durationMs: recordings.durationMs }).from(recordings).where(eq(recordings.id, s.recordingId)).get();
      const dur = rec?.durationMs ?? 0;
      const start = Math.round(a.startMs);
      const end = Math.round(a.endMs);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > dur || end - start < 1000) return "A clip must be at least 1 second long and inside the video.";
      if (end - start > 5 * 60_000) return "Clips can be at most 5 minutes long.";
      set({ startMs: start, endMs: end });
      return null;
    }
  }
}

/** Top open suggestions across the library, strongest first (for the Smart Clip hub). */
export function topSuggestions(db: Db, limit = 12) {
  const rows = db
    .select({ id: clipSuggestions.id, recordingId: clipSuggestions.recordingId })
    .from(clipSuggestions)
    .where(eq(clipSuggestions.status, "suggested"))
    .orderBy(desc(clipSuggestions.score))
    .limit(limit)
    .all();
  const byRec = new Map<string, SuggestionView[]>();
  return rows.flatMap((r) => {
    if (!byRec.has(r.recordingId)) byRec.set(r.recordingId, listSuggestions(db, r.recordingId));
    const v = byRec.get(r.recordingId)!.find((x) => x.id === r.id);
    return v ? [{ recordingId: r.recordingId, suggestion: v }] : [];
  });
}

/** Library-wide Smart Clip overview: analyzed recordings with open suggestions first. */
export function smartClipOverview(db: Db) {
  const analyses = db.select().from(recordingAnalysis).orderBy(desc(recordingAnalysis.requestedAt)).all();
  const counts = db.select({ recordingId: clipSuggestions.recordingId, status: clipSuggestions.status, saveStatus: clipSuggestions.saveStatus }).from(clipSuggestions).all();
  return analyses.map((a) => {
    const mine = counts.filter((c) => c.recordingId === a.recordingId);
    return {
      recordingId: a.recordingId,
      status: a.status,
      open: mine.filter((c) => c.status === "suggested").length,
      saved: mine.filter((c) => c.saveStatus === "saved").length,
      dismissed: mine.filter((c) => c.status === "dismissed").length,
    };
  });
}

export const isSuggestionId = (id: string) => /^clp_[a-f0-9]{16}$/.test(id);
export const isFrameId = (id: string) => /^frm_[a-f0-9]{16}$/.test(id);
