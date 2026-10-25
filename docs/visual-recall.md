# Visual Recall — setup and accuracy findings

Visual Recall lets Recall find moments by what was **on screen**, including in silent recordings. It is opt-in twice: per recording (**Index visuals**) and per search (the Recall **Scenes · experimental** toggle, `?visual=1`; off by default, and CLIP doesn't run when it's off). It runs entirely on this computer and labels every visual match as **approximate**. Design: [ADR 0022](decisions/0022-visual-recall.md).

## Model setup

| | |
|---|---|
| Model | `Xenova/clip-vit-base-patch16` (OpenAI CLIP ViT-B/16, ONNX, 8-bit quantized) |
| Files needed | `config.json`, `preprocessor_config.json`, `tokenizer.json`, `tokenizer_config.json`, `special_tokens_map.json`, `onnx/vision_model_quantized.onnx`, `onnx/text_model_quantized.onnx` |
| Location | `models/Xenova/clip-vit-base-patch16/` (gitignored). Override the folder with `EMBED_MODEL_DIR` and the id with `VISUAL_MODEL_ID`. |
| Runtime | `@huggingface/transformers` (already a dependency), with `allowRemoteModels = false`. METAL never downloads it. |
| Size on disk | ~312 MB including the unused fp16 vision file. The two quantized files alone are ~150 MB. |

**Getting the files.** Download the repository `Xenova/clip-vit-base-patch16` from Hugging Face yourself, with your own approval, into `models/Xenova/clip-vit-base-patch16/`.
- In this worktree they were copied from `~/Projects/metal/models/`. Those were downloaded with approval during the earlier feasibility study, so no new download happened.
- If the files are missing, the recording page and Recall say *"Visual search model not found"*, and indexing refuses to start.

**Why CLIP and not SigLIP.**
- On the same 581 real frames, SigLIP B/16 ranked about as well (hit@5 0.83–0.92).
- But SigLIP's accepted-frame precision was ~0.44, and it accepted 2 of 10 absent scenes.
- CLIP B/16 scored 0.94 precision and accepted 1 of 10, so its scores are better suited to a confidence floor.

## How it works

1. **Opt-in.** On a recording page, **Visual search → Index visuals** queues a durable `visual-index` worker job.
   - If the recording is already indexed with the current version and model, the request returns `current` and does no work.
   - While a job is queued or running, a new request returns `busy`.
2. **Frame sampling.** One FFmpeg decode pass takes a frame every 2 s. Recordings longer than an hour get wider spacing, so there are at most ~1800 regular frames.
   - It also takes a frame just after each hard cut (`scene > 0.4`), but never closer than 0.75 s to the previous one.
   - Timestamps come from FFmpeg `showinfo` (exact pts), shifted to file time.
   - Frames are 224 px tall JPEGs in `data/media/<rec>/visual/`.
3. **Embedding.** Each frame goes through the CLIP vision tower (center crop) into a unit 512-d vector, stored in `visual_frames` with:
   - recording id
   - `t_ms`
   - frame path (the evidence)
   - model id

   `recording_visual_index` records status, version, interval, frame count and timings. Re-indexing writes into a temp folder and swaps it in, replacing only that recording's rows. The original video is only ever read.
4. **Search.** Recall strips request phrasing ("Find when I was holding a sniper" → "holding a sniper"), then embeds the description through four fixed caption-style prompts ("a screenshot of …", "a video game screenshot of …", "a first-person view of …", "a video game scene showing …") and averages them (CLIP prompt ensembling, see "Short queries" below). It scores every indexed frame by cosine similarity.
   - **≥ 0.33 → "Looks similar · approximate".**
   - **< 0.33 → not shown.** There is no low-confidence band: on the tuning set it only added false matches. Event-worded queries are still capped to at most 3 "Low confidence · approximate" moments.
   - Until 2026-10-25 the raw query was embedded on its own, with floors 0.30 / 0.27.
   - When Scenes finds nothing, Recall says so and suggests describing what's on screen ("jungle cliff" or "a dark hallway with a monster", not a single word). These are labelled as phrasing tips, not guaranteed matches.
   - **Scope is always shown.** Normal Recall says "Whole library". The guided demo (`?judge=1`) searches only its approved recording, and the API's `scope` field carries that recording's own line and frame counts. The banner, the index line and the no-match message all say so, and link to "search your whole library" (which leaves the demo). The demo's server-side permissions are unchanged: other recordings, a missing recording, or filters still return 400.
   - Within a recording, only frames within 0.012 of its best frame count. Frames ≤ 4.5 s apart form one moment spanning ±half a sampling interval. Playback starts 1 s before the first matching frame.
5. **Combining with transcripts.** Visual and transcript searches run together.
   - A visual moment that overlaps a spoken moment adds its frames and a small boost to it.
   - Otherwise it is its own result. Visual-only results are never "Strong".
   - Quoted queries mean exact spoken words, so visual search is skipped for them.
6. **UI.** Each result card shows:
   - the preview frames, the timestamp, the "Looks like" source and the CLIP similarity
   - a note that it doesn't confirm actions, kills or events

   The player panel lists the matching frames; clicking one plays from that frame. **Start a story** sends the matched range ±3 s to Story Studio with no caption, since nothing was said.

## Validation on real gaming footage (2026-10-24)

**Setup.**
- **Library:** 22 recordings, 10.5 minutes, all imported into an isolated data dir through the app's own upload and worker pipeline.
  - **Games:** Lethal Company, Phasmophobia, a hospital-hallway horror game, Backrooms, PEAK, Valorant, League of Legends, Marvel Rivals, four Roblox clips and three desktop captures.
  - **Resolution:** 640×360 up to 1080p.
  - **Speech:** only one clip has voice chat, so the rest is effectively silent gameplay.
- **Spliced clip:** one extra Phasmophobia clip with **no audio track**, with exactly 6 s of Valorant inserted at **15.000–21.000 s**.
- **Labels:** scene-level, per recording, or per time range where a clip changes scene.
- **Script:** `scripts/visual-eval/validate.ts`.
- **Thresholds:** the 0.30 floor was tuned on a separate query set in the feasibility study. The 0.27 low-confidence floor was set from the gap between unrelated queries (≤ 0.258) and these held-out queries, so treat its numbers as optimistic.

### Speed and memory (Apple Silicon, CPU)
| | |
|---|---|
| Frames | 328 (≈ 31 per video minute) |
| Indexing wall time | 40–51 s for 10.5 min → **3.8–4.9 s per video minute** (≈ 40% FFmpeg decode, 60% CLIP at 70–90 ms/frame) |
| Peak RSS (worker) | ~630–690 MB while embedding |
| Storage | 2 KB of embedding + ~10 KB of JPEG per frame (656 KiB + 3.3 MiB here) |
| Query latency | ~330 ms for the first query (text-model load), then ~6–25 ms over 328 frames |

### Retrieval (12 held-out descriptions of scenes that exist)
- 11 of 12 returned something:
  - 5 with "Looks similar" matches.
  - 6 with low-confidence matches only.
  - "A game made of simple blocky shapes" (Roblox) returned nothing.
- **Top-1 correct:** 9 of 12.
- **Preview-frame precision:** 0.71 (36 of 51 shown frames belong to the described scene).
- **Wrong moments:** 13 of 32 returned moments contain no correct frame, mostly in the low-confidence tier.
- **Examples of wrong matches:**
  - "players in orange space suits" matched a hallway scene.
  - "MOBA seen from above" matched PEAK.
  - "empty yellow office" matched a hospital hallway as well as Backrooms.

### Absent scenes (10 descriptions not in the library)
- **6 unrelated** (cat, beach, birthday…): **no result** for all 6.
- **4 similar gaming scenes:**
  - "football video game" → no result.
  - "dragon boss fight" and "battle royale parachute drop" → low-confidence only (PEAK frames).
  - **"a horror game in a dark forest at night" → 12 "Looks similar" moments** (Phasmophobia, Lethal Company, hallway). CLIP sees dark horror games as similar. This is the known failure from the feasibility study, and thresholds can't fix it without losing most true matches.

### Timestamp accuracy
- **Silent splice, Valorant truth 15.0–21.0 s:**
  - Three different shooter descriptions each returned the insert as **16.0–20.0 s**, with playback at 16.0 s.
  - Error was ±1 s at the edges, and the reported range always fell inside the true scene.
  - The worst case was −3 s at the end, when only one frame passed.
  - Before the per-recording peak band was added, one query merged nearby Phasmophobia frames and started 14 s early. That was fixed and is covered by tests.
- **Design bound:** ±half the sampling interval (±1 s at 2 s sampling), plus the 1 s lead-in.

### Your example queries (judged by viewing the returned frames)
| Query | Result | Verdict |
|---|---|---|
| Find the monster in the hallway | 3 low-confidence moments: dark hallways, a teammate | No monster visible. Correctly labelled low confidence. |
| Find when I was holding a sniper | 3 low-confidence moments: spectating a teammate holding a tool | Wrong. Labelled low confidence. |
| Show me the dark room with my teammates | 3 "Looks similar" moments: dark Phasmophobia rooms | Dark room correct; teammates aren't clearly visible. |
| Find the scene where an enemy appeared | 3 low-confidence moments, Lethal Company | No enemy visible. Labelled low confidence. |

## Quality validation pass (2026-10-25)

Goal: improve reliability before deciding whether Visual Recall belongs in the final demo. Tooling: `scripts/visual-eval/quality-*.{mts,mjs}`. The center-crop variant reproduces the app's stored embeddings exactly (cosine 1.0000), so variant scores are directly comparable to what ships.

### Footage
- **New real gameplay was scarce.**
  - Only one new clip qualified: a 56 s vertical TikTok of a blocky destruction game.
  - The other recordings in the library were test patterns.
  - The other local videos were meetings, video calls or desktop sessions. They were excluded and not inspected further.
- **The library is now 23 recordings, 356 frames.** More real footage across more games is still the biggest gap.
- **Label correction:** recording `1297` is **Lethal Company throughout**, not "hallway game before 42 s". It is the longer version of `77c0`.
  - With corrected labels, the previous held-out set scores **11/12 top-1 and 24% wrong previews**, not the earlier 9/12 and 0.71 precision.
  - So several earlier "wrong matches" were label errors (e.g. "players in orange space suits" → recording `1297` was correct).

### New held-out queries (written before any scoring; thresholds never tuned on them)
- **24 present queries:**
  - 11 scene
  - 5 edge detail (minimaps, HUD bars, inventory, spectator list)
  - 4 object/action (mannequin by the FIRE EXIT sign, ghost woman, flashlight, climbing), with timed truth
  - 4 game names
- **16 absent scenes,** 5 of them look-alike gaming scenes.
- **8 event queries** (kill, died, ace, 4k, clutch, won, headshot, died to the monster).

### Baseline on the new set (center crop, 0.30 / 0.27)
| | |
|---|---|
| Top-1 correct | **13/24 (54%)**: scene 8/11 · edge 3/5 · object 1/4 · name 1/4 |
| Wrong-scene preview frames | 57/147 (39%); 38/89 moments contain no correct frame |
| Absent scenes with a "Looks similar" match | 3/16 (sniper scope, underwater, dark sewer tunnel); any result 6/16 |
| Event queries with a "Looks similar" match | 1/8: **"an ace" matched a Valorant frame showing the ACE banner** |

### Strongest failures
- **Wrong game, similar scenery:**
  - "dark sewer tunnel lit by a flashlight" → the hallway horror game, rated "Looks similar".
  - "Phasmophobia ghost hunt" → the hallway game.
  - "a player holding a flashlight in a dark hallway" → Lethal Company.
- **Confident false matches:** "looking through a sniper scope at a rooftop" → Valorant, Lethal Company and Phasmophobia frames, all at 0.30.
- **Edge details:** a minimap in the bottom-right corner (League) → PEAK. The center crop removes it. "A health and stamina bar at the bottom left" → Marvel Rivals.
- **Objects and actions:** "a pale mannequin monster next to a FIRE EXIT sign" → Backrooms. "A ghost woman" → the right game, wrong moment (13 s vs the true 25–34 s). Small objects and actions aren't localised.
- **Game names:** "Lethal Company" and "a Valorant match" → no result. CLIP doesn't reliably know these titles.

### Targeted improvements tested
Thresholds for every variant were tuned only on the feasibility TUNE set, using the same rule that produced 0.30, then frozen.

| Variant | Top-1 (new) | Wrong previews | Absent "likely" | Verdict |
|---|---|---|---|---|
| Baseline (center crop, 0.30) | 13/24 | 39% | 3/16 | — |
| Letterbox pad | 12/24 | 36% | 2/16 | Answers fewer (16/24). No gain. |
| Squash to square | 14/24 | 41% | 1/16 | Edge 4/5, but answers fewer and more previews are wrong. Mixed. |
| 3 crops (L/C/R), max | 14/24 | 36% | 2/16 | 3× indexing cost and more absent results (8/16). Not worth it. |
| Center + pad, max | 13/24 | 36% | 2/16 | 2× cost, object 0/4. No gain. |
| Nearby-frame smoothing | 15/24 | 34% | 1/16 | Better on the new set but **worse on the old held-out set** (10/12 vs 11/12). Inconsistent, not adopted. |
| Anchor-caption lift | 12/24 | 38% | 3/16 | No gain. |
| Library-median lift | 13/24 | 33% | 5/16 | Every absent query gets some result (16/16). Rejected. |
| 3 crops + smoothing | 16/24 | 48% | 3/16 | Best top-1 but the most wrong previews. Rejected. |
| Re-tuned floor 0.3039 / 0.305 | 13 → 12/24 | 33% | 1/16 | Fewer wrong previews on both held-out sets (39→33%, 24→17%), but costs a top-1 at 0.305. A precision/recall trade, not a clean gain. Not adopted. |
| Grounded game filter (metadata) | 14/24 (names 2/4) | 37% | 3/16 | Helps only when `recordings.game` is set, and **nothing in METAL sets it today** (0 of 40 recordings in the main library). Not adopted. |
| **Event-query guard** | unchanged | unchanged | unchanged | **Event queries with "likely": 1/8 → 0/8.** No scene or absent query is affected. **Adopted.** |

### Adopted change
- **Event-query guard (`isEventQuery`, `capForEvents`).** Queries about kills, deaths, aces, multi-kills, clutches, wins or headshots still get visual matches, but:
  - at most 3, always low confidence
  - each with a reason saying visual search can't recognise game events
  - with a Recall banner saying the same

  Transcript search is unchanged, so spoken "nice kill" is still found as speech.

### Speed and memory
- **Adopted changes:** neither the guard nor the scoring changes indexing. Speed stays at 3.8–4.9 s per video minute and ~650 MB peak worker RSS.
- **Crop variants:** each extra crop adds one full CLIP pass per frame (~70–130 ms), so 3 crops ≈ 3× embedding time.

### Recommendation: **B — Experimental Visual Recall, opt-in**
- **Why not normal Recall integration:**
  - On queries it was never tuned on, only about half of top results are correct, and 39% of preview frames show the wrong scene.
  - HUD details, small objects, actions and game names are mostly not retrievable.
  - Look-alike genres produce confident false matches.
  - That isn't reliable enough to blend silently into Recall.
- **Why not hold it outside entirely:**
  - Scene-level descriptions work well and fully locally, even on silent footage: night-vision camera views, desktop and code, the neon editor arena, the pink knife Valorant skin, the blocky world, the inventory grid.
  - Timing is ±1 s, and the UI is honest about confidence.
- **Keep it opt-in per recording and labelled approximate.**
- **For the final demo,** only show pre-checked, scene-level queries on footage indexed beforehand. Never event, weapon or object claims.

## Limitations (read before relying on it)
- **Similarity, not recognition.** A match means a frame looks like the words. It cannot confirm actions or events: kills, deaths, 4Ks, aces, "an enemy appeared". It can't tell what a player is holding at HUD scale, and it doesn't count anything. Event-worded queries are capped at low confidence and labelled as such.
- **Similar-looking games get confused.** Dark horror games all look alike to CLIP, and an absent "dark forest horror" scene returns confident-looking matches. The UI says "approximate", but a dark, atmospheric query can still be wrong at the "Looks similar" tier.
- **Center crop.** CLIP sees the middle 16:9 → 1:1 crop, so HUD edges (minimap, ammo, kill feed) are mostly cut off.
- **Short scenes.** Anything under ~2 s may land between samples unless a hard cut was detected.
- **Single words.** One-word scene queries ("jungle") still usually find nothing. This is deliberate; see "Short queries".
- **Validation size.** These are small-sample numbers: 22 short clips and 22 labelled queries. Re-run `scripts/visual-eval/validate.ts` on more footage before tightening claims.
- **No event recognition.** Valorant or other event recognition was intentionally not started.

## Short queries (2026-10-25)

**Problem.** With Scenes on, "jungle" found nothing on PEAK, although "climbing a green jungle mountain" did.
- **Not the cause:** index completeness (all 6 approved recordings were indexed, 117 frames) and request filtering (`describeScene("jungle")` = "jungle"). Judge-mode Recall is scoped to the approved speech recording by design, so PEAK never appears there.
- **Cause: CLIP's raw cosine depends on how long the query is.** On the same PEAK frames, a bare word scores about 0.03–0.06 lower than a sentence: "jungle" 0.251 and "green jungle" 0.254, against the 0.27 floor. The long query reached 0.285.

**Fix: prompt ensembling plus re-calibrated floors.**
- Every query goes through four caption-style prompts (`SCENE_PROMPTS`), averaged in one text-model call. That puts short and long queries on the same scale.
- The floors were tuned **only** on the existing tuning queries, with the same rule as before:
  - tuning set: the 12 present and 10 absent queries from `validate.ts`, plus the 10 feasibility TUNE negatives;
  - rule: no result at all for unrelated queries, no more confident look-alike matches than before, then maximise correct top-1.
- The tuning picked 0.33 for both tiers.
- Script: `scripts/visual-eval/short-queries.mts`. Data: the 21 labelled recordings, 307 frames.

| Set | Before (raw, 0.30 / 0.27) | After (ensemble, 0.33) |
|---|---|---|
| Tuning, present (12) | top-1 10 · any 11 · confident & correct 5 | top-1 10 · any 10 · confident & correct 10 |
| Tuning, unrelated (16) | 1 confident FP, 1 low FP | none |
| Tuning, look-alike (4) | 1 confident FP, 2 low FP | 1 confident FP |
| **Held-out A**, new short queries, present (18) | top-1 6 · any 10 · confident & correct 0 | top-1 7 · any 8 · confident & correct 7 |
| **Held-out A**, short, absent (15) | 1 low FP (lava) | none (underwater, snow, beach … all none) |
| **Held-out B**, quality-pass queries, present (23) | top-1 12 · any 20 · confident & correct 8 | top-1 12 · any 16 · confident & correct 12 |
| **Held-out B**, unrelated (11) | 2 confident FP (incl. "an underwater level with a submarine"), 1 low FP | 1 confident FP (sniper scope) |
| **Held-out B**, look-alike (5) | 1 confident FP, 2 low FP | 1 confident FP |

**Read it as a precision gain.**
- False matches drop on every absent set. The old "underwater" match on PEAK fog is gone.
- Correct answers are now mostly at the "Looks similar" tier instead of "Low confidence".
- The cost is fewer weak-but-right answers: "any result" goes 20 → 16 on held-out B.

**What still doesn't work: single words.**
- With the ensemble, "jungle" peaks at 0.3265 on PEAK. The unrelated tuning query "a farming game with crops and animals" peaks at 0.3252 on the same frames, and "underwater" at 0.3226.
- Any floor that admits "jungle" also admits those, so one-word queries stay unanswered.
- Recall now tells the user to add a detail. Two-word scene descriptions do clear the floor: "jungle cliff" 0.352, "jungle mountain" 0.342, "rocky cliff" 0.345, "a mossy rock wall" 0.346.

**Measured and rejected:**
- **Contrast against a bank of 40 generic scene words:** the fog frames really are "underwater" to CLIP (+0.024 over the best alternative), and the bank penalises true synonyms.
- **Hubness normalisation (CSLS / QB-Norm style):** "jungle" fell below "underwater", and long-set AUC dropped from 0.99 to 0.83–0.97.
- **Library-relative gap and z-score:** "snow" (Roblox) stands out more than "jungle".
- **A low band that admits "jungle":** it would have to sit between 0.3226 and 0.3265, which means tuning on the held-out queries themselves.

## Game and genre searches

CLIP can't tell game genres apart reliably: on the real library "first person shooter" put the two Valorant recordings first but below the floor (0.326 / 0.319), with a first-person non-shooter (backrooms, 0.315) right behind; "Valorant" ranked PEAK above both. Lowering the floor would have returned all three.

Recall therefore matches games and genres from metadata, not pixels (`src/server/search/games.ts`):

- A recording matches a **game** only through the game a person set on its page (`recordings.game`, `PUT /api/recordings/:id/game`; locked for approved judge-demo recordings).
- A **genre** ("first person shooter", "FPS", "shooter game", "tactical shooter", "MOBA" …) matches through METAL's explicit game list, `src/lib/games/catalog.ts` (game → undisputed genres, plus aliases). Unknown games match by name only.
- Results are whole-recording, labelled "Game match · set by you", never approximate-visual and never a timestamp claim. When the search has words beyond the game ("first person shooter on a sunny sandstone street"), game matches become loose and say which words weren't confirmed.
- If a recording also matched by speech or scene, the game is added as a reason on that moment instead of a duplicate result.

## Hand-curated tags

Some moments are things CLIP can't confirm (an ACE, a clutch). A person can tag one in `data/recall-tags.json` (or `METAL_RECALL_TAGS`): recording id, start/end ms, the exact searches it answers, and a label saying what they saw. `src/server/search/tags.ts` returns the tag only for those searches (case, punctuation and spacing ignored), within the usual filters — so judge mode never shows a tag outside its recording. Tagged results are labelled "Tagged match · checked by hand", use the recording's own indexed frames as thumbnails, and come first; loose guesses for the same search are dropped, so the event warning and "No close matches" don't appear for them. Any other wording still goes through normal speech and scene search, with its warnings. A missing or broken file means no tags.
