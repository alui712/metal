# 0013 — Analysis from FFmpeg measurements; rule-based Smart Clip

**Status:** Accepted (Phase 5)

## Context
No speech engine or vision provider is set up: whisper.cpp isn't installed and there is no API key. The user chose to build analysis from signals FFmpeg can measure locally, with speech and vision added later behind the same tables.

## Decision
- **Explicit, local analysis.**
  - A user action ("Find moments") queues an `analyze` job; nothing runs automatically.
  - It runs FFmpeg on this computer: nothing is uploaded and no API key is used. The UI says so.
  - `recording_analysis` records the version, status, stage, and which signals were produced.
  - Speech and scene descriptions are stored as honest "not set up" reasons, reported by `src/server/analysis/providers.ts`.
  - A future vision provider must add consent before sending frames out; a key alone doesn't enable it.
- **Signals (`audio_events` table, with measured evidence in `evidence_json`):**
  - **Loudness peaks:** EBU R128 momentary loudness (400 ms window, sampled every 100 ms) at least 9 LU above the median of the previous 15 s, and at least −40 LUFS.
  - **Sudden jumps:** a rise of 12 LU or more within 1 s. The first second of audio is ignored (meter warm-up).
  - **Silences:** below −60 LUFS for 3 s or more.
  - **Scene changes:** FFmpeg `scdet` at 10 fps.
  - Loudness is never labeled as laughter or any game event; there is no classifier.
- **Keyframes:** evenly spaced samples (every 5–60 s, depending on duration) plus up to 16 of the strongest scene changes, capped at 40 frames at 480 px. They're stored as `frames` rows with timestamps.
- **Timing:** all times are milliseconds from the start of the file. Stream start offsets from ffprobe are applied, so markers line up with the player.
- **Idempotency:**
  - A re-run replaces the recording's signals and frames in one transaction.
  - `requestAnalysis` refuses to queue a second job while one is queued or running.
  - Retries use the existing queue (two attempts; `PermanentJobError` for unreadable input).
- **Smart Clip rules** (`src/server/smartclip/candidates.ts`, a pure function):
  - Loud and sudden signals within 3 s of each other form one event. A burst of 3 or more scene changes within 4 s counts as a weak, picture-only event.
  - Score = 0.6 × the strongest loudness score + 0.15, plus points for a sudden onset, for several signals together, and for nearby picture changes. Each rule's points are stored and shown under "Why this rank".
  - Confidence: strong needs a score of 0.65 or more *and* both audio and picture evidence. Picture-only events are weak.
  - Boundaries: 6 s before and 4 s after the event, 10–45 s long, clamped to the video. If clamping cuts the pre-roll or post-roll, the clip shifts to keep its length.
  - Overlapping clips merge if the result stays ≤ 45 s; otherwise the weaker one is trimmed to footage the stronger one doesn't use, or dropped.
  - Suggestions covering 85% or more of a recording are skipped (it's already a clip).
  - At most 12 per recording, and each says what the evidence can't tell.
  - Titles describe the measurement, e.g. "Loud moment at 0:31".
- **Decisions persist** in `clip_suggestions`: suggested, accepted, or dismissed, with adjusted boundaries. Re-analysis replaces only open suggestions and skips new ones that mostly overlap a decided one.
- **Saving:** Accept queues `clip-export`. It does a frame-accurate H.264/AAC cut from the *original*, then imports it through `receiveUpload` (hash, dedupe, ingest). The result is a library recording with `origin: clip`, `parent_recording_id`, and `parent_start_ms`.
- **Preview** plays the exact range in the recording's own player, using the original or its converted copy (same timeline).

## Consequences
- Suggestions only reflect loudness and picture change. Quiet but important moments are missed, and loud but unimportant ones may be suggested. The UI states this on every suggestion.
- Adding whisper.cpp or a vision provider means new signal kinds feeding the same rules, with no new UI concepts.
