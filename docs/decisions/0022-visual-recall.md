# 0022 — Visual Recall: local CLIP frame index, approximate visual matches in Recall

**Status:** Accepted as **experimental, opt-in** (Visual Recall, `feat/visual-recall`; quality pass 2026-10-25). Renumbered from 0020 on integration, where 0020 is the Judge Experience.

## Context
Recall (ADR 0015) only finds what was said. Most real gameplay has no speech, so users can't find "the dark room" or "the hallway" at all.
- An earlier feasibility study compared CLIP B/16 and SigLIP B/16 on 581 real frames. Both ranked scenes well, but neither reliably rejects *similar-but-absent* gaming scenes. Under a strict "reject or stop" rule, the study recommended stopping.
- This phase instead ships visual search as clearly labelled **approximate** retrieval, with confidence tiers and honest empty states.

## Decision
- **Model:** local CLIP ViT-B/16 (`Xenova/clip-vit-base-patch16`, q8 ONNX) via transformers.js.
  - Remote loading is disabled and a missing model is reported as unavailable.
  - CLIP was chosen over SigLIP for its far better precision above a fixed floor (0.94 vs 0.44 in the feasibility study).
- **Indexing is an opt-in `visual-index` worker job** (`src/server/visual/indexer.ts`), queued by `POST /api/recordings/:id/visual`.
  - **Sampling:** one FFmpeg pass with `select` takes frames every 2 s (wider for recordings over an hour), plus hard cuts. Exact times come from `showinfo`.
  - **Storage:** 224 px JPEGs, each with a unit CLIP vector in `visual_frames`, next to its recording id, `t_ms`, path and model.
  - **Status:** `recording_visual_index` holds status, version, model, interval, frame count and timings.
  - **No duplicate work:** requests return `busy` while a job runs, and `current` when the recording is already indexed with this version and model (`?force=1` re-indexes).
  - **Re-indexing is safe:** frames go to a temp folder that is swapped in, and only this recording's rows are replaced. Sources are read-only, and deleting a recording removes its folder.
- **Migration `0011_visual_index`.** The number was agreed with the parallel branches first.
- **Search** (`src/server/visual/search.ts`):
  - The query is rewritten from request phrasing to a scene description.
  - Frames are scored by brute-force cosine similarity, which is fine at this scale: ~6–25 ms for hundreds of frames.
  - The description is embedded through four fixed caption-style prompts (`SCENE_PROMPTS`) and averaged, so short and long queries share one scale. This was added 2026-10-25, after "jungle" missed PEAK (see "Short queries" in `docs/visual-recall.md`).
  - Rules live in `VISUAL_RULES`:
    - ≥ 0.33 → "Looks similar · approximate" (strength `good`)
    - below 0.33 → nothing. The earlier 0.27–0.30 "Low confidence" band was dropped, because on the tuning set it only added false matches.
    - Event queries are still capped at 3 low-confidence moments.
  - Within a recording, only frames within 0.012 of its peak count, so a long, vaguely similar stretch can't swallow the real scene.
  - Moments span ±half an interval around their frames; playback starts 1 s before the first frame.
- **Event guard** (added after the quality pass): queries about kills, deaths, aces, multi-kills, clutches, wins or headshots never get more than 3 low-confidence visual moments. Each says visual search can't recognise events. Measured: "an ace" had matched the on-screen ACE banner at "Looks similar".
- **Not adopted (measured, no consistent gain):** letterbox, squash or multi-crop embeddings, nearby-frame smoothing, anchor or library-relative scoring, a re-tuned floor, and a game-metadata filter (nothing populates `recordings.game` yet). See `docs/visual-recall.md`.
- **Combining:** `/api/recall` runs transcript and visual search together, and `mergeRecall` combines them.
  - A visual match that overlaps a spoken moment corroborates it.
  - Otherwise it is its own result. Visual-only results are never `strong`.
  - Quoted queries skip visual search.
- **Evidence in the UI:**
  - Preview frames are served by id from `/api/visual-frames/:id`, never by path.
  - Each result shows similarity, sampling interval and the ± timing bound.
  - A standing note says matches don't confirm actions, kills or events.
  - Story Studio handoff reuses Recall's range ±3 s, with no caption.

## Consequences
- Silent recordings become searchable by scene, with ±1 s timing at 2 s sampling. Indexing costs ~4–5 s per video minute and ~650 MB of peak worker memory on CPU.
- **Known false positives:** look-alike scenes in the same genre (dark horror games) can reach the "Looks similar" tier for scenes that aren't in the library. The labels and the ambiguity banner are the mitigation; thresholds alone can't fix it.
- Not provided: action or event recognition (kills, 4Ks, aces), object counts, HUD reading, or anything sent off the machine.
- Findings and setup: [`docs/visual-recall.md`](../visual-recall.md).
