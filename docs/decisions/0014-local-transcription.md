# 0014 — Local transcription with whisper.cpp

**Status:** Accepted (Phase 5C)

## Context
Smart Clip only had loudness and picture-change signals. whisper.cpp 1.9.5 (`whisper-cli`) and `models/ggml-base.en.bin` are now installed. Transcripts must be real, timestamped, local, and reusable by Recall and Time Machine (Phase 6).

## Decision
- **A separate, explicit job.** "Transcribe speech" queues a `transcribe` job in the existing worker (2 attempts). It doesn't depend on `analyze`.
  - Model or binary missing: the job fails permanently with setup instructions, and the API refuses with 409.
  - The provider check verifies the GGML magic bytes ("lmgg") and file size.
- **Model path:** `WHISPER_MODEL_PATH`, else `models/ggml-base.en.bin`, else `data/models/…`. `models/` is gitignored. The language is `en` for `.en` models and `auto` otherwise.
- **Pipeline:**
  1. FFmpeg converts the first audio track to 16 kHz mono PCM WAV. The same pass runs `silencedetect` (−45 dB, 0.5 s).
  2. If less than 300 ms of sound remains, whisper is not run and the result is "No speech detected".
  3. Otherwise `whisper-cli -ojf -sns -dtw <preset> -nfa` runs. The temporary WAV and JSON are deleted afterwards.
- **Timing:**
  - Whisper's segment offsets drift by seconds across silence and background noise. With a matching preset (`ggml-base.en.bin` → `base.en`), DTW token times give word starts within about 0.2 s, and segment bounds come from them.
  - Segments are then snapped to the measured sound. Spill-over slivers under 250 ms are ignored, and only the largest run of sound is kept (gaps up to 1.5 s).
  - All times are file-relative (the audio stream's start offset is applied).
- **Anti-fabrication rules (`SPEECH_RULES`):**
  - A segment is dropped if any of these holds:
    - less than 150 ms of measured sound under it;
    - a bracketed or non-speech tag;
    - mean token probability below 0.3;
    - **more than 30 letters per second of sound.**
  - Whisper confidently invented "I'm going to go ahead and get a little bit of a shot." (p ≈ 0.83) over a 1 s wordless tone. The speaking-rate check catches that; confidence alone does not.
- **Storage (one transaction, idempotent):**
  - `transcript_segments` holds the segments.
  - They're mirrored into `chunks` (`source: transcript`, `source_ref_id` → segment), so FTS5 search works for Phase 6.
  - A provenance row goes in `ai_outputs` (provider `whisper.cpp (local)`, model, input refs).
  - `recording_transcripts` holds status, stage, model, language, voiced time, and segment count.
  - A re-run replaces all of this for the recording.
- **Smart Clip:**
  - Suggestions show the transcript lines inside the clip ("Said in this clip"). Lines within 2 s of a measured signal are marked "near the signal".
  - Speech is *never* used for scores, confidence, or titles. Existing scoring is unchanged whether or not a transcript exists.
  - The uncertainty line adds: "The transcript shows what was said, not what happened on screen."

## Consequences
- No speaker identification. Mic and game audio are mixed if OBS records them on one track, and ASR errors happen (labeled "Machine transcription — words may be wrong").
- Whisper can still turn longer stretches of music or effects into words at a plausible rate. A Silero VAD model (`ggml-silero-v5.1.2.bin`, about 1 MB, `--vad`) would reduce that. It isn't downloaded or used yet.
