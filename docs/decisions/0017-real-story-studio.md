# 0017 — Real Story Studio: persistent stories, one-pass FFmpeg export

**Status:** Accepted (Phase 7)

## Context
Phase 6B handed real moments to the Studio, but edits lived only in memory and export was disabled. Stories must persist, and export must produce a real, browser-playable MP4 from the source recordings. The jobs table, the worker, and the `exports` table already existed.

## Decision
- **Persistence.** A story is `story_projects` (title, aspect, `framing` fill|fit, `captions`) plus ordered `story_clips` (recording id, optional suggestion id, in/out, caption).
  - The editor keeps its pure EDL history (undo/redo in memory) and autosaves the present state with a validated `PUT /api/stories/:id` (600 ms debounce, flushed before export and on `pagehide`). The server rejects ranges outside the recording.
  - `story_clips.recording_id` is now `ON DELETE SET NULL`. Clips whose source was deleted are dropped when the story is opened, and the editor says how many. Clips whose file is missing or whose recording isn't ready are flagged per clip and block export.
- **Handoffs.**
  - Time Machine creates stories from Smart Clip moments, in chronological order.
  - Recall creates one from a result's range (±3 s).
  - Captions start as the moment's machine-transcript text, never a generated line.
- **Export = one worker job (`story-export`), one FFmpeg pass** (`src/server/studio/render.ts`):
  - Each clip is an input with `-ss/-t` (accurate seek, since we re-encode), then normalized: `fps=30`, scale + crop (fill) or scale + pad (fit) to 1920×1080 / 1080×1920 / 1080×1080, `yuv420p`, and 48 kHz stereo `fltp` audio.
  - Video is `tpad` + `trim` and audio is `apad` + `atrim` to *exactly* the clip length, so the concat keeps A/V in sync across cuts. Clips with no audio get `anullsrc` silence.
  - Hard cuts via the `concat` filter; output H.264 high/yuv420p, AAC 192k, `+faststart`.
  - The arguments are an array (no shell). Inputs resolve only through `managedPath`; output goes to `data/exports/<exportId>.part.mp4` and is renamed after verification.
- **Verification before success.** FFprobe must report H.264 + AAC and a duration within 300 ms of the plan; otherwise the job fails. Success is never recorded without a verified file.
- **Job semantics.**
  - `requestExport` runs in an IMMEDIATE transaction: it refuses a second render of a story while one is queued or running, validates every source, snapshots the EDL into `exports.edl_json` (later edits don't change it), then enqueues the job (2 attempts).
  - Missing sources are permanent failures. FFmpeg errors retry once.
  - A killed worker's job is reclaimed by the existing stale-heartbeat logic and re-renders from scratch.
  - The UI status comes from the export row for final states and from the job for in-flight ones.
- **Serving.** `/api/exports/:id` streams by id with Range support (`?download=1` adds an attachment name derived from the title). Only `succeeded` exports are served.
- **Captions.** This FFmpeg build has no `drawtext` or `subtitles` filter (no freetype/libass), so captions are written as an MP4 `mov_text` subtitle track, stated in the UI. Burned-in text would need an FFmpeg with libass.
- **Project management.** Saved stories can be renamed, duplicated, and deleted. A duplicate copies the project settings and ordered clip references with new project/clip ids, but not export history. Project deletion is refused while one of its exports is queued or running.
- **Export management.** The export dialog lists the complete project history with render status, resolution, duration, size, download, and whether the rendered EDL differs from the current story. Export deletion is also refused while queued/running.
- **Owned cleanup.** Destructive operations derive files exclusively from a validated `exp_` id inside `data/exports`; database paths and client paths are never used. Missing files are treated as already cleaned, while unexpected filesystem failures preserve the database row. Deleting a story/export never removes recordings, source clips, or models.

## Consequences
- Rendering re-encodes everything, which is reliable but slower than stream copy (≈ real time or faster for 1080p on an M4).
- Transitions, presets and music are not built; hard cuts are the reliable base.
- Completed and failed exports remain until the user removes an export or its project. Running exports must finish before either can be deleted; cancellation remains intentionally unsupported.
