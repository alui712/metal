# 0004 — Proxy transcodes and FFmpeg

**Status:** Accepted (Phase 0; implementation in Phase 1+)

## Context
Recorders often produce MKV/HEVC/multi-track audio that browsers can't play reliably. Exports must be real MP4s.

## Decision
- Originals are stored untouched. Each import gets an H.264/AAC, faststart, ≤1080p **proxy** used for playback, frame sampling, and export input.
- All media work (probe, transcode, thumbnails, frames, audio extraction, loudness analysis, export) uses FFmpeg/ffprobe via argument arrays (no shell strings), with paths configurable through `FFMPEG_PATH`/`FFPROBE_PATH`.
- Media is served by a Range-capable route handler, never from `public/`.

## Consequences
- Uniform proxy streams make concat-based exports straightforward.
- Import costs one transcode per recording; acceptable for a small demo dataset.
