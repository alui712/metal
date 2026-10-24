# 0015 — Real Recall: hybrid local search over transcripts

**Status:** Accepted (Phase 6A)

## Context
Recall searched demo fixtures only. Real transcript lines now exist in `transcript_segments` and are mirrored into `chunks`/`chunks_fts` (ADR 0014). Search must work offline and without an LLM API, and every result must point at stored rows.

## Decision
- **Real search at `/recall`; the demo moves to `/recall/demo`.** The demo is unchanged and still labeled "Demo data". `/api/recall` returns the source recording id, segment ids, real start/end times, text, the match sources, and plain-language reasons. Paths are never included.
- **Hybrid retrieval (`src/server/search/recall.ts`, pure TS over SQLite):**
  - **Keywords:** the existing FTS5 index with stemmed prefix terms (enemy → `"enem"*`, which also finds "enemies"). Function words and voice-chat filler ("got", "okay") are ignored.
  - **Exact phrase** (normalized). Quoted queries require it.
  - **Meaning:** local `Xenova/all-MiniLM-L6-v2` (quantized ONNX, 23 MB) through `@huggingface/transformers`. `allowRemoteModels = false`, so it never touches the network. Vectors are stored in `chunks.embedding`. Cosine similarity is brute-forced in JS, which is fine at this library size.
  - **Recording name and game.**
- **Ranking:**
  - Exact phrase scores 1.
  - Keywords score 0.35 + 0.5 × the share of query terms found.
  - Meaning scores the similarity itself, counted only if ≥ 0.35.
  - +0.05 per extra source, and lines within 4 s of each other are grouped into one moment.
  - Strength:
    - **strong:** a phrase match, ≥ 75% of terms, or similarity ≥ 0.6;
    - **good:** ≥ 40% of terms, or similarity ≥ 0.47;
    - **weak:** anything else.
  - Weak results are shown only when nothing better exists, and the response is then marked `ambiguous` ("No close matches…"). Unrelated queries return nothing.
  - Thresholds were calibrated on real whisper output: paraphrases score 0.49–0.91, unrelated queries ≤ 0.25.
- **Fallback:** without the model, search is keyword-only and says so. Embeddings are computed after transcription, and lazily on search for older lines.
- **Playback:** results seek to the first matching line's real start. `/recordings/:id?t=<ms>` opens the recording at that moment.
- **Flagging incorrect lines:** `transcript_segments.flagged_at` (migration 0007). A flagged line stays visible (struck through) but is removed from `chunks`, so it leaves FTS and vectors, and from Smart Clip speech evidence. Restoring re-indexes it.
- **Transcription quality:**
  - Silero VAD (`ggml-silero-v5.1.2.bin`, 0.9 MB) runs through `whisper-vad-speech-segments` on the same 16 kHz WAV. Its speech regions, which are on the original timeline, are intersected with the silence map before the existing alignment.
  - `whisper-cli --vad` is deliberately *not* used: with it, DTW word times refer to the trimmed audio, not the original.
  - Stock whisper sign-offs ("thanks for watching", "subscribe") are dropped.
  - Without VAD, transcription works as before.

## Consequences
- Recall finds only what was said and what recordings are named. It can't find visual events, and the UI says so.
- English-centric stop words and stemming. MiniLM is English-focused.
- Re-transcribing replaces lines, so earlier flags are cleared along with the lines they marked.
