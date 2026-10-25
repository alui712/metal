# 0021 — Multi-POV split-screen: side-by-side clips through Story Studio

**Status:** Accepted

## Context
Multi-POV (ADR 0019) plays two POVs side by side on one clock. The handoff to Story Studio sent only the active POV, and the export (ADR 0017) only concatenated clips. It never put two videos in one frame.

## Decision
- **Storage.** Migration `0011_split_clips` adds three columns to `story_clips`. Existing clips stay `single`.
  - `layout`: `single` | `side_by_side`.
  - `secondary_recording_id`: `on delete set null`.
  - `secondary_in_ms`: the second POV's own time at `in_ms`. It's frozen at handoff, so regrouping or nudging the POVs later can't silently shift a story.
  - A side-by-side clip whose second POV was deleted keeps its layout. It is flagged and blocks export; it never silently becomes one POV.
- **Handoff.** In side-by-side view with exactly two playable POVs, "Clip both POVs" sends `secondary`. The window is computed by `splitWindow` (`src/lib/pov/sync.ts`).
  - Conversion: second own time = own + primary offset − second offset.
  - The window is clamped to where both POVs have footage.
  - Under 1 s of overlap, it clips one POV and says so.
- **Validation** (create and save; 400/409 otherwise): a different recording, ready, with footage for the whole clip.
- **Editing.**
  - A trim moves `secondary.inMs` by the same delta (`applyOp`), so the pair can't drift.
  - Trim bounds are limited to where the second POV has footage.
  - The caption is per clip, over the full frame.
  - `edlKey` includes the pairing, so an older export reads as outdated.
- **Preview.**
  - Two `<video>` elements: left|right, or top/bottom for 9:16.
  - The second POV is muted and follows the first's `currentTime`, re-seeking when it drifts more than 80 ms.
  - A "Side by side · aligned" badge is shown.
- **Render** (`storyArgs`).
  - The second POV is an extra input cut at its aligned in-point for the same length, directly after its primary.
  - Both halves go through the clip's normalize/tpad/trim chain at W/2×H (or W×H/2), then `hstack`/`vstack`. That makes one segment of exactly the clip's length, so concat, caption overlays and the subtitle track are unchanged. Overlay and subtitle indices count every video input.
  - Sound is the primary POV's.
- **`-reinit_filter 0` on every clip input.**
  - A source whose frame properties change mid-clip makes FFmpeg rebuild the whole filtergraph. Example: a Medal clip's appended outro, encoded with different colour tags.
  - The rebuild restarts every chain's `PTS-STARTPTS`. That silently skipped about 4.4 s of the *other* POV in a real export.
  - With reinit off, scale/format convert the new frames in place. This also covers single clips.

## Consequences
- Two POVs per clip in v1. With 3–6 POVs, side by side still clips one POV and says so.
- The second POV has no independent trim or slip. Alignment comes from the Multi-POV sync, which stays the user's job (ADR 0019).
- Verified:
  - unit tests (args, window math, storage, validation);
  - a real-FFmpeg test in which each frame's brightness encodes the world frame, with a mid-clip colour-tag change. It fails without `-reinit_filter 0` or with a 3-frame misalignment.
  - an end-to-end run on the real PEAK pair in an isolated copy. Each half matches its source within 1 frame.
