import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { JobContext } from "../../worker/handlers";
import { config } from "../config";
import type { Db } from "../db/client";
import { aiOutputs, chunks, recordings, recordingTranscripts, transcriptSegments } from "../db/schema";
import { newId } from "../ids";
import { PermanentJobError } from "../jobs/errors";
import { enqueueJob } from "../jobs/queue";
import { managedPath } from "../media/storage";
import { ensureEmbeddings } from "../search/recall";
import { ffmpegLog, streamOffsets } from "./analyze";
import { speechProvider, vadProvider } from "./providers";

// Local speech transcription with whisper.cpp (whisper-cli). Audio never
// leaves this computer. Whisper's own timestamps drift across silence and it
// can "hear" words in silent audio, so segments are aligned to — and only
// kept where — FFmpeg measured actual sound.

export const TRANSCRIBE_VERSION = "whisper-cli-2";

export type Interval = { startMs: number; endMs: number };
export type RawSegment = { fromMs: number; toMs: number; text: string; confidence: number | null };
export type Segment = { startMs: number; endMs: number; text: string; confidence: number | null };

/** Non-silent intervals from FFmpeg `silencedetect` output. */
export function parseVoiced(stderr: string, durationMs: number): Interval[] {
  const silences: Interval[] = [];
  let open: number | null = null;
  for (const m of stderr.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    const ms = Math.max(0, Math.round(Number(m[2]) * 1000));
    if (m[1] === "start") open = ms;
    else if (open !== null) {
      silences.push({ startMs: open, endMs: ms });
      open = null;
    }
  }
  if (open !== null) silences.push({ startMs: open, endMs: durationMs });
  const voiced: Interval[] = [];
  let at = 0;
  for (const s of silences) {
    if (s.startMs > at) voiced.push({ startMs: at, endMs: Math.min(s.startMs, durationMs) });
    at = Math.max(at, s.endMs);
  }
  if (at < durationMs) voiced.push({ startMs: at, endMs: durationMs });
  return voiced.filter((v) => v.endMs - v.startMs >= 50);
}

/**
 * Speech regions from `whisper-vad-speech-segments` stdout
 * ("Speech segment 0: start = 403.00, end = 445.00", centiseconds), padded
 * slightly and merged. Times are on the original audio timeline.
 */
export function parseVadSegments(stdout: string, durationMs: number, padMs = 150): Interval[] {
  const raw = [...stdout.matchAll(/Speech segment \d+: start = ([\d.]+), end = ([\d.]+)/g)]
    .map((m) => ({ startMs: Math.max(0, Math.round(Number(m[1]) * 10) - padMs), endMs: Math.min(durationMs, Math.round(Number(m[2]) * 10) + padMs) }))
    .sort((a, b) => a.startMs - b.startMs);
  const out: Interval[] = [];
  for (const r of raw) {
    const last = out.at(-1);
    if (last && r.startMs <= last.endMs) last.endMs = Math.max(last.endMs, r.endMs);
    else out.push({ ...r });
  }
  return out;
}

export const intersect = (a: Interval[], b: Interval[]): Interval[] =>
  a.flatMap((x) => b.map((y) => ({ startMs: Math.max(x.startMs, y.startMs), endMs: Math.min(x.endMs, y.endMs) })).filter((i) => i.endMs > i.startMs));

/**
 * Segments from whisper-cli `-ojf` JSON. Special tokens are excluded. With
 * `-dtw`, each token carries a DTW-aligned time (`t_dtw`, centiseconds),
 * which tracks when words were said far better than segment offsets.
 */
export function parseWhisperJson(json: string): { language: string | null; segments: RawSegment[] } {
  const d = JSON.parse(json) as {
    result?: { language?: string };
    transcription?: Array<{ offsets: { from: number; to: number }; text: string; tokens?: Array<{ text: string; p: number; t_dtw?: number }> }>;
  };
  const segments = (d.transcription ?? []).map((s) => {
    const toks = (s.tokens ?? []).filter((t) => !/^\[_|^<\|/.test(t.text));
    const dtw = toks.filter((t) => typeof t.t_dtw === "number" && t.t_dtw >= 0).map((t) => t.t_dtw! * 10);
    const timed = dtw.length > 0;
    return {
      // DTW times mark word starts: pad the last word, and stay inside whisper's own window.
      fromMs: timed ? Math.max(s.offsets.from, Math.min(...dtw)) : s.offsets.from,
      toMs: timed ? Math.min(s.offsets.to, Math.max(...dtw) + DTW_TAIL_MS) : s.offsets.to,
      text: s.text.trim(),
      confidence: toks.length ? toks.reduce((a, t) => a + t.p, 0) / toks.length : null,
    };
  });
  return { language: d.result?.language ?? null, segments };
}

const DTW_TAIL_MS = 400;

/** whisper-cli's DTW alignment presets, named after the model (ggml-base.en.bin → base.en). */
const DTW_PRESETS = new Set(["tiny", "tiny.en", "base", "base.en", "small", "small.en", "medium", "medium.en", "large.v1", "large.v2", "large.v3", "large.v3.turbo"]);
export const dtwPreset = (modelFile: string) => {
  const name = modelFile.replace(/^ggml-/, "").replace(/\.bin$/, "").replace(/-/g, ".");
  return DTW_PRESETS.has(name) ? name : null;
};

/** Sign-offs Whisper is known to produce from silence or music (YouTube captions in its training data). */
const STOCK_HALLUCINATION = /^(thanks?( you)? (so much )?for watching|please (like and )?subscribe|subtitles by|transcribed by)/i;

export const SPEECH_RULES = {
  /** A segment needs this much measured sound under it, or it's treated as hallucinated. */
  minVoicedMs: 150,
  /** Sound slivers shorter than this at a segment's edges are spill-over from neighbours. */
  edgeSliverMs: 250,
  /** Whisper's mean token probability below this is too unsure to show. */
  minConfidence: 0.3,
  /** Sound separated by a longer silence than this isn't the same utterance. */
  maxGapMs: 1500,
  /**
   * More letters than this per second of sound can't have been spoken (fast
   * speech is ~25): typically Whisper inventing a sentence over a tone or effect.
   */
  maxLettersPerSecond: 30,
};

/** Keeps segments backed by real sound, with boundaries snapped to that sound. */
export function alignSegments(raw: RawSegment[], voiced: Interval[]): Segment[] {
  const out: Segment[] = [];
  for (const s of raw) {
    if (!s.text || /^[[(].*[\])]$/.test(s.text) || /^[\s.,!?♪-]*$/.test(s.text) || STOCK_HALLUCINATION.test(s.text)) continue;
    if (s.confidence !== null && s.confidence < SPEECH_RULES.minConfidence) continue;
    const pieces = voiced
      .map((v) => ({ startMs: Math.max(v.startMs, s.fromMs), endMs: Math.min(v.endMs, s.toMs) }))
      .filter((p) => p.endMs > p.startMs);
    const total = pieces.reduce((a, p) => a + p.endMs - p.startMs, 0);
    if (total < SPEECH_RULES.minVoicedMs) continue;
    const solid = pieces.filter((p) => p.endMs - p.startMs >= SPEECH_RULES.edgeSliverMs);
    // A segment can stretch across a long silence onto unrelated sound: keep its largest run of sound.
    const runs: Interval[][] = [];
    for (const p of solid.length ? solid : pieces) {
      const last = runs.at(-1);
      if (last && p.startMs - last[last.length - 1].endMs <= SPEECH_RULES.maxGapMs) last.push(p);
      else runs.push([p]);
    }
    const size = (r: Interval[]) => r.reduce((a, p) => a + p.endMs - p.startMs, 0);
    const use = runs.reduce((best, r) => (size(r) > size(best) ? r : best));
    const letters = (s.text.match(/\p{L}/gu) ?? []).length;
    if (letters / Math.max(0.2, (use[use.length - 1].endMs - use[0].startMs) / 1000) > SPEECH_RULES.maxLettersPerSecond) continue;
    out.push({ startMs: use[0].startMs, endMs: use[use.length - 1].endMs, text: s.text, confidence: s.confidence });
  }
  return out;
}

const languageFor = (modelFile: string) => (/\.en\.bin$/.test(modelFile) ? "en" : "auto");

function vadRun(args: string[], { signal, timeoutMs }: { signal?: AbortSignal; timeoutMs: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(config.whisperVadPath, args, { signal, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(new Error(`Voice detection failed: ${err.message.slice(0, 200)}`));
      else resolve(String(stdout));
    });
  });
}

function whisper(args: string[], { signal, timeoutMs }: { signal?: AbortSignal; timeoutMs: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(config.whisperPath, args, { signal, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, _o, stderr) => {
      if (err) reject(new Error(`whisper-cli failed: ${String(stderr).trim().split("\n").slice(-2).join(" ").slice(0, 300) || err.message}`));
      else resolve();
    });
  });
}

/**
 * Worker job "transcribe": FFmpeg → 16 kHz mono WAV (+ silence map) →
 * whisper-cli → aligned segments. Idempotent: a re-run replaces this
 * recording's transcript.
 */
export async function transcribeRecording({ db, job, progress, signal }: JobContext): Promise<void> {
  const id = job.recordingId;
  if (!id) throw new PermanentJobError("Transcription job has no recording.");
  const rec = db.select().from(recordings).where(eq(recordings.id, id)).get();
  if (!rec) throw new PermanentJobError("Recording no longer exists.");
  const setT = (v: Partial<typeof recordingTranscripts.$inferInsert>) => db.update(recordingTranscripts).set(v).where(eq(recordingTranscripts.recordingId, id)).run();
  const wav = managedPath(`${id}/speech.wav`);
  const outBase = managedPath(`${id}/speech`);

  try {
    if (rec.status !== "ready" && rec.status !== "analyzed") throw new PermanentJobError("This recording isn’t ready yet — wait for it to finish processing.");
    const durationMs = rec.durationMs ?? 0;
    if (durationMs <= 0) throw new PermanentJobError("This recording has no duration to transcribe.");
    const file = managedPath(rec.originalPath);
    if (!fs.existsSync(file)) throw new PermanentJobError("The video file is missing from storage.");
    const provider = speechProvider();
    if (!provider.available) throw new PermanentJobError(provider.reason);
    const modelFile = config.whisperModelPath;
    const model = path.basename(modelFile);
    setT({ status: "running", stage: "audio", error: null, jobId: job.id, model });
    const timeoutMs = Math.max(120_000, durationMs * 2);

    progress({ stage: "audio", progress: 0.1 });
    const offsets = await streamOffsets(file, signal);
    let segments: Segment[] = [];
    let voicedMs = 0;
    let vad = false;
    let language: string | null = null;
    if (offsets.hasAudio) {
      const log = await ffmpegLog(
        ["-hide_banner", "-nostdin", "-loglevel", "info", "-y", "-i", file, "-map", "0:a:0", "-vn", "-af", "silencedetect=noise=-45dB:d=0.5", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav],
        { signal, timeoutMs },
      );
      let voiced = parseVoiced(log, durationMs);
      // Voice activity (Silero), when set up: only human speech counts, not music or effects.
      if (voiced.length && vadProvider().available) {
        progress({ stage: "voice", progress: 0.2 });
        setT({ stage: "voice" });
        const out = await vadRun(["-vm", config.whisperVadModelPath, "-f", wav, "-np"], { signal, timeoutMs });
        voiced = intersect(voiced, parseVadSegments(out, durationMs));
        vad = true;
      }
      voicedMs = voiced.reduce((a, v) => a + v.endMs - v.startMs, 0);
      // Nothing but silence: don't ask a model to find words in it.
      if (voicedMs >= 300) {
        progress({ stage: "speech", progress: 0.3 });
        setT({ stage: "speech" });
        const lang = languageFor(model);
        const dtw = dtwPreset(model);
        // DTW word timing needs flash attention off (-nfa).
        await whisper(["-m", modelFile, "-f", wav, "-l", lang, "-ojf", "-of", outBase, "-np", "-sns", "-t", "4", ...(dtw ? ["-dtw", dtw, "-nfa"] : [])], { signal, timeoutMs });
        const parsed = parseWhisperJson(fs.readFileSync(`${outBase}.json`, "utf8"));
        language = parsed.language ?? (lang === "auto" ? null : lang);
        segments = alignSegments(parsed.segments, voiced).map((s) => ({
          ...s,
          startMs: Math.min(durationMs, s.startMs + offsets.audioOffsetMs),
          endMs: Math.min(durationMs, s.endMs + offsets.audioOffsetMs),
        }));
      }
    }

    progress({ stage: "saving", progress: 0.9 });
    const prev = db.select({ aiOutputId: recordingTranscripts.aiOutputId }).from(recordingTranscripts).where(eq(recordingTranscripts.recordingId, id)).get();
    const aiId = newId("ai");
    db.$client.transaction(() => {
      db.delete(transcriptSegments).where(eq(transcriptSegments.recordingId, id)).run();
      db.delete(chunks).where(and(eq(chunks.recordingId, id), eq(chunks.source, "transcript"))).run();
      if (prev?.aiOutputId) db.delete(aiOutputs).where(eq(aiOutputs.id, prev.aiOutputId)).run();
      db.insert(aiOutputs)
        .values({
          id: aiId,
          kind: "transcript",
          provider: "whisper.cpp (local)",
          model,
          promptVersion: TRANSCRIBE_VERSION,
          inputRefsJson: JSON.stringify([{ recordingId: id, audioOffsetMs: offsets.audioOffsetMs }]),
          outputJson: JSON.stringify({ language, segments: segments.length, voicedMs, vad: vad ? "silero-v5.1.2" : null }),
          jobId: job.id,
        })
        .run();
      for (const s of segments) {
        const segId = newId("seg");
        db.insert(transcriptSegments).values({ id: segId, recordingId: id, startMs: s.startMs, endMs: s.endMs, text: s.text, confidence: s.confidence }).run();
        db.insert(chunks).values({ id: newId("chk"), recordingId: id, source: "transcript", sourceRefId: segId, startMs: s.startMs, endMs: s.endMs, text: s.text }).run();
      }
      setT({ status: "done", stage: null, error: null, hasAudio: offsets.hasAudio, segmentCount: segments.length, voicedMs, language, aiOutputId: aiId, finishedAt: Date.now() });
    })();
    // Search vectors (local model). Optional: Recall falls back to keywords and backfills later.
    try {
      await ensureEmbeddings(db);
    } catch (err) {
      console.error(`[transcribe ${job.id}] embeddings skipped:`, err instanceof Error ? err.message : err);
    }
  } catch (err) {
    const permanent = err instanceof PermanentJobError;
    const final = permanent || job.attempts >= job.maxAttempts;
    if (!(err instanceof Error && err.name === "AbortError")) {
      setT(final ? { status: "failed", stage: null, error: permanent ? (err as Error).message : "Transcription failed. Try again.", finishedAt: Date.now() } : { status: "queued", stage: null });
    }
    if (!permanent) console.error(`[transcribe ${job.id}]`, err instanceof Error ? err.message : err);
    throw err;
  } finally {
    fs.rmSync(wav, { force: true });
    fs.rmSync(`${outBase}.json`, { force: true });
  }
}

/** Queues transcription unless one is already queued or running. */
export function requestTranscription(db: Db, recordingId: string): "queued" | "busy" {
  const cur = db.select().from(recordingTranscripts).where(eq(recordingTranscripts.recordingId, recordingId)).get();
  if (cur && (cur.status === "queued" || cur.status === "running")) return "busy";
  const values = { status: "queued" as const, stage: null, error: null, requestedAt: Date.now(), finishedAt: null };
  db.$client.transaction(() => {
    const job = enqueueJob(db, { kind: "transcribe", recordingId, maxAttempts: 2 });
    db.insert(recordingTranscripts)
      .values({ recordingId, ...values, jobId: job.id })
      .onConflictDoUpdate({ target: recordingTranscripts.recordingId, set: { ...values, jobId: job.id } })
      .run();
  })();
  return "queued";
}

export type TranscriptView = {
  status: "none" | "queued" | "running" | "done" | "failed";
  stage: string | null;
  error: string | null;
  finishedAt: number | null;
  hasAudio: boolean | null;
  model: string | null;
  language: string | null;
  voicedMs: number | null;
  /** Whether transcription can run now, and if not, why. */
  setup: { available: boolean; reason: string | null };
  /** `flagged`: the user marked the line wrong (excluded from search and Smart Clip). */
  segments: Array<{ id: string; startMs: number; endMs: number; text: string; flagged: boolean }>;
};

/** A recording's transcript lines; lines the user flagged as wrong are excluded unless asked for. */
export function readSegments(db: Db, recordingId: string, { includeFlagged = false } = {}) {
  return db
    .select({ id: transcriptSegments.id, startMs: transcriptSegments.startMs, endMs: transcriptSegments.endMs, text: transcriptSegments.text, flagged: sql<boolean>`${transcriptSegments.flaggedAt} is not null` })
    .from(transcriptSegments)
    .where(includeFlagged ? eq(transcriptSegments.recordingId, recordingId) : and(eq(transcriptSegments.recordingId, recordingId), isNull(transcriptSegments.flaggedAt)))
    .orderBy(asc(transcriptSegments.startMs))
    .all()
    .map((s) => ({ ...s, flagged: Boolean(s.flagged) }));
}

export function transcriptView(db: Db, recordingId: string): TranscriptView {
  const t = db.select().from(recordingTranscripts).where(eq(recordingTranscripts.recordingId, recordingId)).get();
  const p = speechProvider();
  return {
    status: t?.status ?? "none",
    stage: t?.stage ?? null,
    error: t?.error ?? null,
    finishedAt: t?.finishedAt ?? null,
    hasAudio: t?.hasAudio ?? null,
    model: t?.model ?? null,
    language: t?.language ?? null,
    voicedMs: t?.voicedMs ?? null,
    setup: p.available ? { available: true, reason: null } : { available: false, reason: p.reason },
    segments: t?.status === "done" ? readSegments(db, recordingId, { includeFlagged: true }) : [],
  };
}
