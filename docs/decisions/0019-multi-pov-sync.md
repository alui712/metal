# 0019 — Multi-POV Sync: evidence-based discovery, offset groups, one shared clock

**Status:** Accepted (Phase 8B)

## Context
Players want to watch the same play from a teammate's recording. METAL only has local files that were imported with permission. There are no accounts, matchmaking data or cloud. Recording clocks can be missing (undated files), approximate (file dates), or off by seconds between PCs. Two recordings at the same time are not necessarily the same match.

## Decision
- **Discovery is evidence-only** (`src/server/pov/povs.ts`).
  - **Candidates:** other ready recordings whose recorded times overlap, or are within 2 min. Recordings with unknown times are checked by audio only, at most 8 per run.
  - **Exclusions:** Smart Clip cuts of the same footage (`parent_recording_id`, `origin = clip`) and recordings tagged with a different game.
  - **Labels:** "Likely the same match" requires reliable shared audio. Clock overlap alone is "Possible — not confirmed". Undated recordings appear only with reliable audio.
  - **Who pairs:** only the user pairs recordings.
- **Shared-audio alignment** runs in the worker as a `pov-match` job, on explicit "Find other POVs" (`src/server/pov/audio-sync.ts`).
  - **Feature:** the first audio stream, mono 8 kHz, becomes a spectral-flux envelope (32 ms Hann frames every 10 ms).
  - **Correlation:** FFT cross-correlation, with Pearson correlation computed over each lag's overlap. Lags are ranked by significance (r·√overlap), so short edge overlaps don't win by chance. A parabola refines the peak below 10 ms.
  - **Search window:** when both clocks exist, ±2 min around the clock offset; otherwise the full overlap. The first hour of each file is decoded.
  - **Reliable** needs all three:
    - distinct ≥ 2.2: the peak's significance ÷ the best significance ≥ 0.5 s away;
    - prominence ≥ 12: a robust z-score against all lags;
    - r ≥ 0.15.
    
    These were calibrated on real files as well as synthetic ones. Unrelated tone-heavy test footage reached 1.92 / 9.8, and a true pair scored 3.85 / 16.7. Weaker peaks are shown as "Some shared audio, not conclusive".
  - **Storage:** results go in `pov_matches`, replaced on each run.
- **Groups and offsets.**
  - `pov_groups` holds a group, and `pov_members` holds `(recording, group, offset_ms, sync_source, sync_confirmed)`. A recording is in at most one group, and a group holds at most 6.
  - Group time T = a member's own time + `offset_ms`, so any POV maps to any other through T. That also covers different lengths and partial coverage.
  - Pairing joins or merges groups. Merging shifts the merged group so the pair lands where the evidence says.
  - New offsets are **suggested** (`clock`/`audio`/`manual`) until the user presses "Sync looks right" or nudges them. Nudges are ±1 s, ±100 ms or ±1 frame at that POV's own fps, saved as `manual` and confirmed.
  - Unpairing never touches recordings. Player names are the user-typed `recordings.owner_label`.
- **Viewer** (`/povs/[id]`, `src/components/pov/pov-viewer.tsx`).
  - **Clock:** one requestAnimationFrame clock. The audible POV leads while it has footage, and wall time advances otherwise.
  - **Followers:** every other POV follows, visible or hidden, so switching is instant. Drift under 250 ms is corrected with ±5 % playback rate; larger drift re-seeks. While paused, POVs are kept within 30 ms.
  - **Audio:** exactly one POV is unmuted.
  - **Missing footage:** POVs without footage at T wait at their edge with "starts recording in …" or "recording has ended". Unavailable files get an honest overlay.
  - **Studio handoff:** "Clip this moment" creates a story through the existing `createStory` ranges path. It uses the active POV's recording id and own-time range (T − 5 s … T + 5 s, clamped). The export engine is unchanged.

## Consequences
- Audio alignment assumes the POVs share sound: voice chat, or loud game events both players heard. Players on separate voice channels, or recordings with music over the game, may only reach "possible". The user can still pair them by hand and line them up with the nudges.
- Speed changes and dropped audio inside a recording aren't modelled, because the offset is a single constant per POV. Long recordings are aligned on their first hour.
- `pov_matches` stores the classification made under the rules at that time. Changing the rules means re-running "Find other POVs" (the panel's "Check again").
