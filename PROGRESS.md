# METAL — Progress

> "Every moment has a story."

Product: a local, **web-first** gameplay recording and clipping app (Next.js server + worker on localhost; recording via OBS; Electron deferred — ADR 0009). Final submission: a 3-minute 1080p demo — Capture → AI Smart Clip → Recall → Time Machine → Story Studio. Architecture decisions: [`docs/decisions/`](docs/decisions/README.md).

| Phase | Status |
|---|---|
| 0 Foundation | ✅ Complete |
| 1 Cinematic UI (demo fixtures) | ✅ Complete |
| 1b Desktop-first UX (capture home, Sources, capture settings) | ✅ Complete |
| 2 Real video ingestion | ✅ Complete |
| 3 OBS capture (record, replay buffer, Save Clip, auto-import) | ✅ Complete |
| 4 Watched folders & local Medal folder connector | ✅ Complete |
| 5 Analysis + Smart Clip (FFmpeg signals; speech/vision not set up) | ✅ Complete |
| 5C Local transcription (whisper.cpp) | ✅ Complete |
| 6A Real Recall (transcripts, FTS + local embeddings) | ✅ Complete |
| 6B Real Time Machine (sessions, Relive, Studio handoff) | ✅ Complete |
| 7 Real Story Studio (persistent stories, FFmpeg MP4 export) | ✅ Complete |
| 8A Final UI/UX polish | ✅ Complete |
| 8B Multi-POV Sync | ✅ Complete |
| Story Studio management | ✅ Complete |
| 8C Demo readiness | ✅ Complete |
| Judge Experience (showcase, guided tour, home polish) | ✅ Complete |
| Multi-POV split-screen export | ✅ Complete (branch `feat/split-screen-export`) |
| Demo video / trailer | ⏳ Not started |
| Stretch: Wrapped · Desktop packaging (Electron) | ⏳ Not started |

---

## Multi-POV split-screen export ✅ (2026-10-25)

- **Flow:** Multi-POV side by side → "Clip both POVs to Story Studio" → one side-by-side clip (both recording ids, plus the second POV's aligned in-point) → trim and caption → Export MP4 with both POVs in one frame (ADR 0021).
  - Single view and existing stories are unchanged.
- **Fixed in the export:** a source that changes frame properties mid-clip (such as a Medal outro) made FFmpeg rebuild the graph, which skipped footage in every clip. All clip inputs now use `-reinit_filter 0`.
- **Verified:**
  - typecheck, lint, 212 tests (10 whisper/embedding tests skip without `models/`), and a production build.
  - The real-FFmpeg split test is frame-exact and fails on a 3-frame shift or without the fix.
  - Isolated copy on the real PEAK pair:
    - 18/18 UI checks, including the handoff, trim keeping a 2507 ms lag, the caption, preview drift ≤ 59 ms, and a single-POV regression export.
    - Export: 1920×1080, 30 fps, 6.48 s; strict full decode passes; each half matches its source within 1 frame.
- **Limits:**
  - Two POVs per clip; no independent trim of the second POV.
  - The audio check could not confirm the pair's manual offset (inconclusive), so its accuracy rests on the user's Multi-POV sync.

## Judge Experience — Memory Dive 2.0 ✅ (2026-10-24)

- **Start guided demo:** a staged dive of about 0.95 s, replacing the 0.62 s fade.
  - Live: press, headline exit, copy recedes, the reel pushes, the cards fly out (parallax), a violet light sweep and wash.
  - Then a view transition dissolves into the real Recall page; the dock follows, and focus moves to the page heading.
- The first stop is prefetched on mount. Fallbacks: no view-transition support or reduced motion navigate at once; a double click starts one dive.
- **Memory cards** dive with reel parallax (`card-dive`, about 0.65 s).
- No sound cue: left out on purpose (no licensed asset, and it would need its own mute setting).
- **Verified** on an isolated production build (127.0.0.1:3002, so the server on :3001 was left alone for video capture):
  - 18 dive checks: four dives took 944–976 ms;
  - real-speed screencast frames, with no black, white or frozen frames;
  - 179 regression checks.

## Judge Experience — Final cinematic polish ✅ (2026-10-24)

- **Continuous reel:**
  - after the intro, the showcase background keeps cycling all six approved recordings (crossfades only, wraps last → first);
  - one 16:9 framing with a 100–105% drift; a blurred fill for non-16:9 viewports;
  - a dark HUD edge, a left gradient and a vignette;
  - pauses when hidden or off screen.
- **Headline:** both lines rise word by word out of masks, line two a beat later, then one light sweep across the violet line. No layout shift; reduced motion uses a fade.
- **Memory Dive** on Start guided demo: copy drifts off at once, the gameplay frame pushes forward into violet light, and Recall settles in, followed by the dock. Memory cards dive into their recording the same way (this replaces a morph that never fired). Enter METAL is a faster (~400 ms) lift-and-settle.
- **Layout:** card fallbacks reserve their real height (CLS 0.000 at 1920 and 390, was 0.006/0.036).
- **Verified:** 21 browser checks: headline, intro, framing, 44 s loop with wrap, hidden tab, card dive, Memory Dive timing and destination, Back, Enter METAL, keyboard, reduced motion, 390. Plus the regression journeys.

## Judge Experience — Memory Portal polish ✅ (2026-10-24)

- **Showcase intro film:**
  - approved footage behind the headline, ~5.5 s, then the memory cards push in;
  - Skip/Escape and Replay; CTAs usable throughout;
  - once per tab, muted, pauses off screen, no autoplay with reduced motion.
  - The video slot reads `public/showcase/intro.mp4` (not supplied yet); until then it uses approved posters.
- **Transitions:** a showcase → app "portal" view transition under 1 s, and a memory card → player morph.
- **Interaction polish:** feature cards and memory cards get matching hover, focus and press feedback.
- **Verified:** 19 intro checks (timing, skip/replay, off-screen pause, reduced motion, 390, CLS 0.006, portal), plus the tour, layout, scope, safety and Cycle 2 journeys.

## Judge Experience — Safety pass ✅ (2026-10-24)

- **Judge mode is read-only in the UI:**
  - Studio is an unsaved preview, with no render or delete;
  - the night has no rename, favorites, Send to Story Studio or regrouping;
  - POV has no sync edits or clipping;
  - Recall has no Open recording or Start a story.
- **Links stay in the demo;** intentional exits are labeled "Leave the demo".
- **Export history:** only approved exports (the new `exports` list) appear in judge mode, both in the API and in the dialog.
- **Opt-in `"lock": true`:** write routes refuse (423) anything touching approved content. Unit tests cover it, plus route tests on a temporary data dir.
- **Browser checks:** the old Relive checks were replaced by corrected ones (see `relive.mjs`).

## Judge Experience — Cycle 1B: approved scope ✅ (2026-10-24)

- **Judge mode:** `?judge=1` on tour links; the server scopes the night, Relive, Recall API, story API and POV page to the approved list. Out-of-scope judge URLs are refused, not substituted.
- **Readiness:** a night needs approved, playable moments, and story clips must pass `checkSources()`.
- **Home:** the spotlight cover and counts come only from the approved scope.
- **Exact stops:** Recall also checks `recording` and rejects extra filters; POV rejects `t`. "Return to demo" restores the exact URL.
- **Verified:** typecheck, lint, 203 tests, build, `judge:ready` 10/10, and browser checks: scope 29, tour 21, layout 13, Cycle 2 suites, judge pages at 390. `demo:check` not run.

## Judge Experience — Cycle 2: UI/UX quality ✅ (2026-10-24)

- **Recall:** only the current query's answer is shown. Superseded searches are aborted. The server's error message appears with Retry, and a search in progress shows "Searching for …". Home examples are the verified demo line (real Recall) plus demo queries labelled "Demo" that open `/recall/demo`.
- **Relive:** shows "Loading moment n of N…" or "Buffering…" instead of a silent black screen. After 8 s it offers Retry and Skip. The screen reader announces each moment once, with no ticking timecode, and the moment scrubber has a focus ring.
- **Capture:** after 3 failed polls the UI says "Lost contact with METAL" (sidebar: "No server reply") rather than keeping a stale "Connected" or "Recording", and the controls are disabled until the server answers (`src/lib/capture/poll.ts`). No backend changes.
- **Accessibility:**
  - `ink-faint` changed #6b6b78 → #8a8a97, now ≥ 4.5:1 on all graphite surfaces.
  - The shared Scrubber shows a focus ring.
  - The POV live region announces POV switches only.
  - The command palette no longer overflows at 390 px and scrolls the keyboard-highlighted option into view.
  - Smooth scrolls respect reduced motion.
- **Touch:** "hover to play" becomes "tap to open" on devices without hover.
- **Verified:** typecheck, lint, 194 tests, build, and browser checks at 1920 and 390 (error injection, slow network, keyboard, reduced motion, touch). The Cycle 1 tour journey (21) and layout journey (14) still pass. `demo:check` was not run (it writes test data).

## Judge Experience — Cycle 1: demo reliability ✅ (2026-10-24)

- Approved list `data/judge-demo.json`, verified by `curate()`. There is no "latest story/group" selection, and `npm run judge:ready` gives a read-only checklist (currently 10/10 ready).
- POV tips state the real sync method and status; this pair was lined up by hand and confirmed, not audio-synced.
- Exact stop matching, "Return to demo", dock hidden over Relive, stale tour state discarded.
- Fixed: export status checks used `"done"`; the DB value is `"succeeded"`.
- Verified: typecheck, lint, 187 tests, build, and a 21-check browser journey (keyboard, reduced motion, Relive, off-step, Back/Next/Finish). `demo:check` was not run, because it adds a clip, a story and an export to the judging DB.

## Judge Experience ✅ (2026-10-24)

- `/showcase`: cinematic, chrome-free first impression. It has a logo reveal; the headline "The game ends. The moment doesn’t."; a fanned stack of the featured night's most vivid real recordings (muted hover preview, no autoplay); "Start guided demo" and "Enter METAL"; and four feature cards backed by real evidence.
- Guided tour: four stops on real content (a real spoken line in Recall, the best night, the latest POV group, the latest story), carried by a dock across the app with Back/Next, a link home to the showcase, minimise and end. It falls back to index pages with honest tips.
- Home: Featured night band and "Jump into a feature" cards first; then Capture, Ask your memories and Recent recordings. There are showcase entry points in the sidebar, mobile header and ⌘K.
- Fixed: hidden `<Activity>` routes kept `data-immersive` in the DOM and hid the sidebar after leaving the showcase.
- Verified: typecheck, lint, 177 tests, build (`/showcase` ◐), `demo:check` 20/20, and a headless journey at 1920 and 390 (14 checks). ADR 0020.

---

## Phase 8C — Demo readiness ✅ (2026-10-24)

The 3-minute demo journey was audited end to end on real footage at 1920×1080. **No app blockers were found, so no app code changed.** Full report, demo script, footage checklist and fallbacks: [`docs/demo/README.md`](docs/demo/README.md).

### Done
- **Real footage prepared** through the app's own actions:
  - **Find moments** and **Transcribe speech** ran on the four real OBS gameplay captures. That gave 5 measured suggestions; no speech was detected in any of them.
  - One Smart Clip was saved from `2026-10-24 12-47-11`.
- **Footage classified:**
  - **Real gameplay:** 4 captures, all Roblox Studio playtests.
  - **Real but not gameplay:** 3 desktop or editor captures.
  - **Test fixtures:** everything else, now listed in the demo doc.
- **`npm run demo:check`** (`scripts/demo-check/`): drives headless, muted Chrome through Capture → Smart Clip → Recall → Time Machine/Relive → Multi-POV → Story Studio → MP4 export.
  - It checks media with ffprobe and saves screenshots to `data/demo-check/`.
  - Recording and session IDs can be overridden with environment variables.

### Verified
- **`npm run demo:check`: 20/20 PASS, no browser errors.**
  - **Smart Clip:** the saved clip is exactly its source range, 14.40 s.
  - **Recall:** exact phrase and paraphrase hits play at the spoken timestamp.
  - **Time Machine:** Relive plays the real night.
  - **Multi-POV:** a switch keeps the moment (20 000 → 20 000 ms).
  - **Story Studio:** the real night export is 1920×1080 H.264/AAC, 25.80 s vs 25.8 s planned, rendered in about 4.5 s.
  - **Layout:** the viewer and Studio fit at 1920×1080.
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ · `npm run build` ✅

### Known gaps (footage, not code)
- **Recall:** no real gameplay contains speech, so it is demonstrated on the scripted test recordings.
- **Multi-POV:** no second real POV exists, so it is demonstrated on the labelled samples.
- **Screen content:** the real captures are full-display. They show Roblox Studio panels and, around 02-42-27 0:07, a desktop browser with chat text. Re-record with Game Capture, or check every frame before showing it.
- **Data added by testing:** one Smart Clip and several stories and exports from the check runs. Nothing was deleted.

---

## Story Studio management ✅ (2026-10-24)

Saved projects and their rendered files can now be managed without touching source media.

### Implemented
- Story cards have accessible actions to rename, duplicate, and delete a project. Destructive actions require confirmation; a duplicate gets new project/clip ids and no copied export history.
- Cards show created and edited dates, mutation success/failure feedback, and a stronger first-use state linking to Time Machine and Recall.
- The export dialog lists every prior render with status, resolution, duration, file size, date, download, and a “Story changed” badge when its rendered EDL no longer matches the current edit.
- Exports can be deleted after confirmation. Project deletion cleans all of its export artifacts; both operations refuse queued/running renders.
- Cleanup derives only validated `exp_` filenames in `data/exports`. Missing files are safe to remove from history, cleanup failures preserve the database row, and original recordings, Smart Clips, models, and source files are never removed.
- Story/export reads and writes keep the existing same-origin and privileged-action checks; no local path is returned.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (161 passed, 10 environment-dependent tests skipped) · `npm run build` ✅.
- Small synthetic FFmpeg media covered export creation, metadata, download, file cleanup, already-missing files, cross-project ownership, and source-recording preservation.
- Headless Chromium covered rename and duplicate persistence, deletion cancellation/confirmation, export history/download/delete, success feedback, reloads, keyboard-accessible controls, desktop, and 390 px with no horizontal overflow or console errors.

### Known limitations
- Running exports cannot be cancelled or deleted; let the worker finish, then remove the export or project.
- Export history is intentionally complete and unpaginated because METAL is local-first; very large long-lived libraries may eventually need pagination.

---

## Phase 8B — Multi-POV Sync ✅ (2026-10-24)

Watch the same play from teammates' recordings (local files imported with permission). Migration `0010_multi_pov`. No new dependencies. ADR 0019.

### Implemented
- **Find other POVs** (recording page panel; "Other POVs" link on every Time Machine recording row):
  - **Candidates come only from evidence:** recording clocks that overlap or are within 2 min, matching game tags, and shared audio. Undated recordings are checked by audio only.
  - **Exclusions:** Smart Clip cuts of the same footage and recordings tagged with a different game are never suggested.
  - **Audio comparison:** runs locally in the worker (`pov-match` job): a spectral-flux envelope plus FFT cross-correlation, with Pearson correlation over each overlap, ranked by significance and refined below 10 ms.
  - **Labels:** "Likely the same match" only with reliable shared audio (distinctness ≥ 2.2 and prominence ≥ 12), and the evidence is listed: overlap, shared-audio offset, game. Clock-only matches are "Possible — not confirmed"; weak peaks say "not conclusive".
  - **Empty state:** an honest message with an Import link. Recordings can also be paired by hand from a list.
- **Sync:**
  - `pov_groups` / `pov_members` persist each POV's offset on a shared timeline; groups join or merge, up to 6 POVs.
  - Offsets come from audio, clocks or by hand, and stay **Suggested sync** until **Sync looks right** or a manual nudge, which turns them into **Sync confirmed**.
  - Nudges are ±1 s, ±0.1 s, or ±1 frame at that POV's own fps (30 vs 60 verified).
  - Different lengths, frame rates and partial coverage are handled through group time.
- **Viewer** (`/povs/[id]`):
  - **Views:** "One POV", with instant switching (1–6 keys or the list) that keeps the exact moment, or "Side by side" (2-column grid; stacked on mobile).
  - **Clock:** one clock, led by the audible POV. Followers are drift-corrected by rate or re-seek, hidden POVs included.
  - **Audio:** exactly one POV is audible ("Click to listen" on a tile), with mute (M).
  - **Coverage:** "who recorded when" lanes. Each tile shows "starts recording in …" or "recording has ended" when it has no footage at that moment.
  - **Edge cases:** buffering spinners, and an "unavailable" overlay for missing files (including errors that happen before hydration).
  - **Player names:** editable, and they persist (`recordings.owner_label`).
  - **Keyboard:** Space, ←/→, 1–6, M, V.
- **Studio handoff:** **Clip this moment to Story Studio** creates a story through the existing `createStory` ranges path, with the active POV's recording id and own-time range (±5 s, clamped). The export engine is unchanged.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (167 tests; 14 in `src/server/pov/`) · `npm run build` ✅
  - **Audio:**
    - true pairs are found exactly (≤ 15 ms) across 12 synthetic plays, and any "reliable" result on a short overlap is exact;
    - unrelated audio is never reliable;
    - a regression test pins the real-footage false positive found during testing (distinctness 1.92, prominence 9.8 → "weak");
    - real FFmpeg files at 30 vs 60 fps and different lengths align to within 30 ms;
    - a file without audio is handled.
  - **Service** (real files through the upload and worker pipeline):
    - clocks alone give "possible"; after listening, B is "likely" at 12 250 ms ± 30;
    - an overlapping recording with different audio stays "possible"; an undated recording with shared audio is found; an undated unrelated one is not listed;
    - Smart Clip cuts are excluded;
    - pairing, manual pairing, nudging, confirming, merging and unpairing work, and recordings are untouched;
    - the Studio range is exact.
- **Real playback in the browser** (localhost:3001; two synced sample recordings imported through the app):
  - **Scenario:** 35 checks.
  - **Discovery and labels:** "Find other POVs" shows B as likely at +12.25 s, the overlapping unrelated C stays unconfirmed, and tone-heavy unrelated footage is not "likely".
  - **Switching:** a paused switch lands within 18 ms of the same moment, and switching while playing keeps the timeline going.
  - **Sync between POVs:** hidden POVs follow within ~15 ms, and side-by-side drift was 29–46 ms.
  - **Audio:** exactly one POV is audible.
  - **Coverage:** "starts recording in 0:11" shows before B began.
  - **Sync edits:** confirm, +317 ms of nudges (3 × 0.1 s + 1 frame at 60 fps) persisted after reload, then nudged back; the player name persisted.
  - **Studio handoff:** opens the Studio with B's exact id and range.
  - **Other cases:**
    - a blocked video shows "unavailable" while the other POV keeps playing;
    - the empty state shows Import;
    - the Time Machine row links to the panel;
    - 390 px and reduced motion work.
  - **Regression suites:** scenario-dev 69, p2 27, p3 10, p5hub 3, p5c 12, p6 18, p6b 33 (the date-filter check is now independent of the sample data), p7 24, p7m, Phase 8A Relive 9, Studio 7 and misc 7 — all passing.
  - The test browser now runs with `--mute-audio`.

### Known limitations
- Audio alignment needs shared sound, such as voice chat or loud game events both players heard. Otherwise the result is "possible" and you pair and line up by hand.
- One constant offset per POV: speed drift inside a recording isn't corrected. Only the first hour of each file is compared.
- The test data left in the library includes the three POV sample recordings (A and B are paired; B is named "Sample player B") and the stories the Studio handoff test created. Nothing was deleted.

---

## Phase 8A — Final UI/UX polish ✅ (2026-10-24)

Polish across the core flow. No new features or dependencies, and no change to how anything works. ADR 0018.

### Implemented
- **Time Machine Relive:**
  - two `<video>` slots; the next moment is loaded and seeked in the hidden slot after each crossfade, so cuts, including between different recordings, crossfade (450 ms) instead of going black;
  - the black curtain now appears only on the first load or for a jump whose frame isn't ready yet;
  - timestamps, Space/←/→/Esc, the segment buttons and reduced motion (instant swap) are unchanged.
- **Story Studio:**
  - **Captions burned into the MP4** (sharp SVG → PNG → FFmpeg `overlay`, timed per clip), while the `mov_text` track is kept;
  - the preview draws the caption with the same layout module, so its line breaks, size and position match the export exactly;
  - the preview's fill/fit framing already matched FFmpeg's center crop/pad (verified);
  - **Rendering state:** a percentage, a step tracker (Queued → Checking sources → Rendering → Verifying), elapsed time, and "you can close this";
  - **Finished reveal:** "Your story is ready" fades in with a scale and blur, and the video autoplays muted only when it finished while you watched;
  - timeline tiles lift on hover and have a visible focus ring (motion-reduced aware).
- **Recall:**
  - the top result is cued at its exact second as soon as results arrive (paused, no autoplay);
  - the matched transcript lines are quoted large under the player, with timestamps and highlights.
- **Smart Clip:**
  - the signal chips are grouped into **Measured** (FFmpeg loudness, picture changes, local transcript) and **AI understanding** (scene descriptions, shown dashed as "not set up");
  - the home card no longer promises "laughter and reactions", which METAL can't detect, or shows the stale "Arrives in Phase 5" text; it describes the measured signals and links to the suggested clips.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (153 tests) · `npm run build` ✅
  - New tests: the overlay graph after the concat (subtitle-track mapping kept); caption layout (wrap, 3-line cap, XML escaping); a real-FFmpeg render where the caption band differs from a no-caption render.
- Real export from the app with the worker: 1080×1920 H.264 + AAC + mov_text, 40.500 s, caption visibly burned in with the same three lines as the preview; temporary PNGs removed.
- **Browser (headless Chrome):**
  - **New Phase 8A scenarios:**
    - Relive, 9 checks: maximum black during skips measured at 0.00, including a cut across recordings; back jump, Esc and cleanup;
    - Studio and export, 7 checks: preview caption geometry vs export (font 0.046, bottom 0.14), stepper, reveal, muted autoplay, mobile;
    - Recall, Smart Clip, home and 390 px, 7 checks.
  - **Regression suites:**
    - scenario-dev 69, p2 27, p3 10, p5hub 3, p5c 12, p6 18, p6b 33 (incl. reduced motion and 390 px), p7 (real export, 409/404 guards), p7m — all passing.
  - Screens were reviewed at 1920×1080.

### Known limitations
- Caption wrapping uses estimated glyph widths. The box is sized generously, but an unusual font fallback could wrap a word differently.
- Relive preloads only the next moment. A jump of more than one moment still shows a brief curtain while that video seeks.
- There's still no UI to delete stories or exports, and transitions remain hard cuts in the export.

---

## Phase 7 — Real Story Studio ✅ (2026-10-24)

Stories built from your real recordings are saved, editable, and render to a real MP4 in the worker. No new dependencies. ADR 0017.

### Implemented
- **Persistent stories:**
  - title, clip order, trims, captions, aspect (16:9 / 9:16 / 1:1) and framing (fill/crop or fit/bars) autosave (`PUT /api/stories/:id`, validated against each recording's length) and survive reloads;
  - undo/redo works as before;
  - a "Saved / Saving… / Not saved" indicator;
  - `/studio` now lists your stories (cover, clip count, length, aspect, last export status). The demo editor is at `/studio?demo=1` (and `?session=<demo id>`).
- **Handoffs:**
  - Time Machine "Send to Story Studio" (Phase 6B), now captioned with the moment's real transcript lines;
  - new: **Recall → "Start a story"** makes a clip around the matched lines, captioned with what was said.
- **Missing sources:** clips whose recording was deleted are removed on open, with a notice (migration `0009` makes `story_clips.recording_id` `SET NULL`). Clips whose file is missing or not ready are marked "Source unavailable" in the timeline and block export with the reason.
- **Real MP4 export:** a `story-export` job in the existing worker queue does one FFmpeg pass over the original recordings.
  - **Cuts:** frame-accurate, with each clip normalized to 30 fps, yuv420p, the output size (1920×1080 / 1080×1920 / 1080×1080, fill or fit) and 48 kHz stereo.
  - **Sync:** silence for clips without audio, and video and audio forced to exact clip length (A/V stay in sync across cuts).
  - **Output:** hard cuts, H.264/AAC, faststart.
  - **Verification:** FFprobe checks the output (codecs, duration within 300 ms) before the export is marked done.
- **Export jobs:**
  - **States:** real queued, rendering (stage plus `-progress` percentage), done and failed states.
  - **Duplicates:** a second export of the same story is refused while one runs (409).
  - **Validation and errors:** sources are validated before queuing; missing files fail permanently, and FFmpeg errors retry once, then fail with the message.
  - **Worker restarts:** jobs are reclaimed and re-rendered.
  - **Storage and serving:** output lives only in `data/exports/<id>.mp4` (`.part` until verified), and `/api/exports/:id` streams it with Range support (`?download=1` to download).
- **Export UI:**
  - settings (size, framing, 30 fps, format, length, captions) and a cinematic rendering state with a progress bar;
  - a finished-video player with Download MP4 and Replay, plus "Render again";
  - a notice when the story changed since the last export;
  - a rendering percentage on the Export button.
- **Captions:** exported as an MP4 subtitle track. This FFmpeg build has no `drawtext`/`subtitles` filter, so text can't be burned in; the dialog says so.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (151 tests; 9 in `src/server/studio/`) · `npm run build` ✅
  - **Pure tests:** the FFmpeg graph (normalization, silence, concat) and the SRT timeline.
  - **Real-FFmpeg tests, mixed sources:** 720p30 H.264 + audio, 4:3 25 fps MPEG-4 MKV without audio, and 1080p60 + mono 44.1 kHz.
    - **Output:** 1920×1080, 30/1, H.264/AAC, 7.5 s (±0.1).
    - **A/V sync:** audio and video lengths are within 60 ms, and the silent clip lands at exactly 3.0–5.5 s (silencedetect, ±60 ms).
  - **9:16 with a captions track** (1080×1920, `mov_text`).
  - **Retry after a simulated worker crash** still produces the file.
  - **Missing and corrupt sources:** a missing file is refused up front (409 with the clip and reason); a corrupt file fails after its retry with "Rendering failed…", no file, and no success.
  - **Duplicate export refused.**
  - **Saving:** save/reload of reorder, trims, aspect and framing; out-of-range trims rejected; deleted sources reported.
- **Browser (dev server :3001, real worker), 25/25:**
  - **Story creation:** Time Machine → Studio with 4 clips and transcript captions.
  - **Editing:** remove, undo and redo; trim; Alt+→ reorder; 9:16 + Fit; autosave; reload keeps order, aspect and framing, and the trim is in the DB.
  - **Rendering:** a duplicate export gets 409 while rendering, and the rendering state is shown.
  - **Output:** FFprobe on the result shows 1080×1920 H.264/AAC at **40.50 s for a 40.5 s plan**, with video and audio both 40.500 s.
  - **Playback and download:** the finished video plays in the browser and Replay restarts it. The download returns 200 `video/mp4` as an attachment, with byte size equal to the file. Bad or traversal ids return 404.
  - **After the export:** an edit shows the "changed since this export" notice, and the stories list shows "Exported".
  - **Recall handoff:** a one-clip story captioned "…enemies on the stairs".
  - **Mobile:** no horizontal scroll at 390 px.
- **Regression suites:** demo walkthrough 69/69 (default demo project now at `/studio?demo=1`), ingestion 27/27, OBS 10/10, Smart Clip hub 3/3, transcription 12/12, Recall 18/18, Time Machine 33/33 (its "export unavailable until Phase 7" check now expects the real Render button).

### Known issues / limitations
- **Not built:** transitions, visual presets and music (hard cuts only). Natural-language edits are still "not connected".
- **Captions:** a soft subtitle track, not burned in. The editor preview overlays them; players must enable the track.
- **Previews vs. exports:** the editor preview plays originals in the browser, so it can't preview FFmpeg's exact fill/fit crop for sources whose aspect differs. The export is authoritative.
- **No delete UI:** there's no UI to delete stories or exports. Exports accumulate in `data/exports/`, and test stories from Phases 6B–7 remain in the DB.
- **Undo history** is per page visit (not persisted); the saved state is what persists.
- **Rendering re-encodes** every clip: reliable, but slower than copying streams.

---

## Phase 6B — Real Time Machine ✅ (2026-10-24)

Time Machine now runs on your real recordings and Smart Clip moments. No new dependencies or downloads. ADR 0016.

### Implemented
- **Honest recording times.**
  - Each recording records where its time came from: file name, metadata, OBS capture, file date (labeled approximate), parent clip, or manual.
  - Import time is no longer used as a recording time anywhere. Migration `0008` clears upload times equal to the import time and backfills sources. A backup was taken first: `data/metal.pre-0008.db`.
  - OBS/recorder file-name timestamps are applied to existing rows (e.g. `Replay 2026-10-22 21-04-11.mkv` → 21:03:xx, after subtracting the duration).
- **Automatic sessions:**
  - grouped by recording time, a configurable gap (15 min – 4 h, default 45), and game changes;
  - idempotent with stable ids, and only writes on change;
  - clip outputs are excluded, so moments never duplicate.
- **Manual grouping persists:**
  - rename, move a recording (to a session, a new session, or out), split here, merge into, and add undated recordings from the "Not in a session" tray;
  - edits lock the session against regrouping; "Return to automatic grouping" undoes that.
- **`/sessions`:** a "time river" of nights grouped by month, with a cover keyframe, time range, counts (recordings, footage, moments, transcript lines, favorites), and "Approximate times" / "Edited" labels.
  - Filters by game (when tagged) and date range; there is a gap setting.
  - The demo moved to `/sessions/demo`, linked from the page.
- **`/sessions/:id`:**
  - a cinematic hero and a to-scale wall-clock rail (recording posters, with moments as violet ticks; favorites glow);
  - chronological moment cards with keyframe, wall-clock time ("≈" when approximate, "Time unknown" when unknown), confidence, evidence chips, a transcript excerpt labeled "machine transcript", select, and favorite;
  - a thumbnail opens `/recordings/:id?t=<ms>` at the exact moment;
  - honest states for sessions with no analysis or no known times.
- **Relive This Night** (`/sessions/:id/relive[?moments=…]`):
  - plays the real videos in order, one `<video>` seeked to each moment's range, with curtain fades;
  - Space pauses/resumes, ←/→ moves between moments, segment buttons jump, and Esc exits;
  - shows the current event (wall-clock time, recording, timestamp, evidence, transcript) and the position (n / N, a per-moment progress bar);
  - unplayable videos are skipped and counted, and the autoplay-blocked state is explained;
  - reduced motion swaps the fades for instant cuts.
- **Story Studio handoff:**
  - "Send N to Story Studio" stores a story with real recording ids, suggestion ids, and exact in/out, in chronological order;
  - `/studio?story=` opens it in the existing EDL editor (trim bounds come from the real recordings);
  - real thumbnails, and a live preview playing the originals ("not rendered");
  - "Your recordings" replaces the demo badge, and export says MP4 export arrives in Phase 7.
- New APIs (all privileged writes; reads are same-origin):
  - `GET/PATCH /api/sessions`, `GET/PATCH /api/sessions/:id`;
  - `POST /api/stories`, `GET /api/stories/:id`;
  - `PATCH /api/clips/:id` now also takes `favorite`/`unfavorite`.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (144 tests; 17 new) · `npm run build` ✅
  - **Time parsing:** OBS, compact, and replay names; invalid dates rejected; no invented times.
  - **Clustering:** gap and game splits.
  - **Factual titles.**
  - **Multiple sessions and single-recording sessions;** undated recordings stay out; clip outputs are excluded.
  - **Re-sync is stable.**
  - **The gap setting regroups.**
  - **Manual move, rename, split, and merge** persist through regrouping; reset works.
  - **An undated-only session** gets no time or title.
  - **Moments** are chronological, without duplicates or dismissed ones, with favorites.
  - **Studio handoff** keeps the order and exact boundaries, and refuses empty, dismissed, or unknown moments.
  - **Relive** play order, pause/resume, skip, jump, unplayable skip, and exit.
- **Browser (dev server :3001, real data), 33/33:**
  - The list shows 4–5 real sessions. Date filter and empty state work, and the gap goes 15 → 45 and back.
  - In the tray, an undated analyzed clip goes to a new session and a second is added. The session shows "Recording times unknown" and 4 real moments.
  - A rename persists after reload, and so does a favorite.
  - A thumbnail opens the recording at 23.70 s (t=23700).
  - Relive plays moment 1 from `/api/media/…`, pause holds, resume, → goes to 2/4, ← goes to 1/4, a jump goes to 4/4 under reduced motion, and Esc returns to the session.
  - The Studio handoff opens `/studio?story=sty_…` with "Your recordings" and the real video preview. Export says Phase 7.
  - There's no horizontal scroll at 390 px on the list, session, or Relive. The demo `/sessions/demo` and `/sessions/ses_sector7` still work.
  - Cleanup reset the test session and favorite.
- **Regression suites:** demo walkthrough 69/69 (Time Machine demo now at `/sessions/demo`), ingestion 27/27, OBS 10/10, Smart Clip hub 3/3, transcription 12/12, Recall 18/18.

### Known issues / limitations
- Folder files with only a file date (mtime) are grouped approximately and labeled that way. Times can be wrong if files were copied.
- There's no UI yet to type in a recording time (`manual` is reserved); undated recordings can only be placed into sessions.
- Sessions have no summaries: there's no grounded text model, so only factual counts are shown. Real sessions currently have few moments, because only the Smart Clip test uploads (undated) have been analyzed. Analyze the OBS recordings to fill their timelines.
- Studio edits on a Time Machine story aren't saved yet, and the browser test left five test story projects in the DB. MP4 rendering is Phase 7.
- Relive preloads only the current video. Jumping between recordings shows a short black curtain while the next one loads.

---

## Phase 6A — Real Recall ✅ (2026-10-24)

Recall now searches your real, machine-transcribed recordings, locally. Approved downloads, both in gitignored `models/`:
- Silero VAD `ggml-silero-v5.1.2.bin` (0.9 MB);
- `Xenova/all-MiniLM-L6-v2`, quantized (23 MB), plus the npm package `@huggingface/transformers`.

Inference is offline: remote model loading is disabled. ADR 0015.

### Implemented
- **`/recall` searches the real library. The demo is preserved at `/recall/demo`** (labeled "Demo data" and linked from Recall). The ⌘K palette now opens real search.
- **Hybrid search** (`src/server/search/`):
  - the existing FTS5 index, with stemmed prefix terms and filler words ignored;
  - exact phrases (quotes force a phrase match);
  - local semantic similarity;
  - recording names and games.
- **Ranking:** transparent strengths (strong, good, loosely related), with reasons such as "Exact phrase …", "Matched words: smoke, entrance", "Similar meaning (similarity 0.75)", or "2 matching lines close together".
  - Weak matches appear only when nothing better exists, labeled "No close matches".
  - Unrelated queries return nothing.
- **Results:** recording, real timestamp, the matching transcript lines with highlighted words, and match sources.
  - Clicking a result plays it in place from the line's real start. **Open recording** goes to `/recordings/:id?t=<ms>`, which opens at that moment.
- **Filters:** transcribed recording, game (shown when any recording has one), and a date range, all kept in the URL. An honest empty state says filters may be hiding results.
- **Labels:** "Machine transcription (whisper.cpp) — words may be wrong. A match shows what was said, not what happened on screen." The index line shows how many lines and recordings are searchable, whether meaning-matching is active, and how many lines are excluded.
- **Flag incorrect lines:** a flag button on each transcript line. A flagged line is struck through ("Marked wrong · not searched") and removed from the search index and Smart Clip evidence. Restore re-indexes it. Migration `0007` adds `transcript_segments.flagged_at`.
- **Transcription quality:**
  - Silero VAD speech regions (on the original timeline, via `whisper-vad-speech-segments`) gate segments in addition to the silence map. `whisper-cli --vad` isn't used, because it breaks the DTW timestamps.
  - Stock whisper sign-offs are dropped.
  - Embeddings are computed after transcription; older lines get them lazily on search.
- Smart Clip scoring is unchanged.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (127 tests; 12 new) · `npm run build` ✅ (no warnings)
  - **Search tests (real whisper lines, real embeddings):**
    - an exact phrase gives the right recording, segment id, and 6940 ms;
    - quoted phrases;
    - keywords across recordings, with highlights;
    - paraphrases: "enemy spotted on the staircase", "we got the win", and "go left" each find the right line;
    - "pizza recipe", "baking bread", and gibberish return nothing;
    - ambiguous handling;
    - flag excludes and restore re-indexes;
    - recording, game, and date filters;
    - grouping of nearby lines;
    - title matches;
    - keyword fallback without the model.
  - **VAD:** parsing and intersection. All real-whisper transcription tests pass *with VAD on*: timings within 0.5–0.6 s, no words on the tone, silent and no-audio cases, retries.
- **Live on :3001 (worker + dev server):** 5 real recordings re-transcribed with VAD; 8 searchable lines across 4 recordings, all embedded.
  - "enemies on the stairs" → voice chat at 0:06.94, strong (phrase, 0.91).
  - "smoke the entrance" → match end at 0:06.12.
  - "gg, close game" → 0:30.16, good.
  - "rotating" → 0:04.2.
  - "we won" → weak only, flagged ambiguous.
  - "where should we attack", "pizza recipe", `"left side"`, and a future date filter → nothing.
  - A recording filter narrows results correctly.
- **Browser (CDP):** 18/18.
  - Phrase result with highlights; it plays from 0:06.94.
  - The deep link opens the recording at exactly 6.94 s.
  - Paraphrase, loose-match label, honest no-match, and both filters (URL-synced).
  - Flag, then not searchable, then restore, then searchable again.
  - The demo still works; no horizontal scroll at 390 px; no console errors.
- **Regression:** 69/69 (demo Recall checks now point at `/recall/demo`), 27/27, 10/10, Smart Clip hub 3/3, transcript UI 12/12.

### Known issues / limitations
- Recall only knows what was said and what recordings are named; it can't see gameplay.
- VAD also removed one misheard line on the voice-chat test ("I love him", which was really "finish him").
- Both OBS replay clips contain detected human speech (VAD 5.9 s and 1.75 s), so their single lines are likely real voices, possibly misheard.
- Re-transcribing a recording clears its flags (the lines are replaced).
- No recordings have a game set yet, so the game filter stays hidden until one does.
- `npm audit` reports 4 moderate advisories in `esbuild` under the dev tooling. This predates this phase and wasn't force-fixed.
- The :3001 dev server was restarted once, with approval.

---

## Phase 5C — Local transcription ✅ (2026-10-24)

whisper.cpp 1.9.5 (`whisper-cli`) with `models/ggml-base.en.bin`. The model is verified (GGML header) and loads. Everything runs locally: no uploads, no API key (ADR 0014).

### Implemented
- **`transcribe` worker job**, started only by **Transcribe speech** on a recording:
  - FFmpeg converts audio to 16 kHz mono WAV and maps silence in the same pass. Then whisper-cli runs with DTW word timing.
  - Segments are snapped to measured sound and stored with file-relative timestamps.
  - Temporary files are removed afterwards. Re-runs replace the transcript (idempotent), and a second request while one is running is refused ("busy").
- **Honest states:**
  - Silent audio: "No speech detected", and the model isn't run.
  - No audio track: reported as such.
  - Model or whisper missing: setup instructions in the UI; the API refuses (409) and the job fails permanently, without retrying.
  - Inference crash: retried once, then "Try again".
- **Anti-fabrication:** segments are dropped when there's no measured sound under them, when they're a non-speech tag, when token confidence is low, or when they're too fast to have been spoken (more than 30 letters/s). The last rule caught a real high-confidence hallucination over a wordless tone.
- **Recording page:** a Transcript panel.
  - Timestamped lines; click to play from a line; the active line is highlighted during playback.
  - Shows the model name and the caveat "Machine transcription — words may be wrong".
  - The local-processing note appears before running.
- **Smart Clip:**
  - Each suggestion shows "Said in this clip" with timestamps and a "near the signal" mark.
  - The speech chip shows ✓ with the segment count, or "not transcribed yet" / "no speech detected".
  - Scores, confidence, and titles are unchanged; speech is context only.
- **Phase 6-ready:** segments are mirrored into `chunks` (FTS5 indexed), with an `ai_outputs` provenance row.
- **Schema:** migration `0006` adds `recording_transcripts`. `config.whisperModelPath` resolves `WHISPER_MODEL_PATH`, then `models/`, then `data/models/`. `models/` is gitignored.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (115 tests; 13 new) · `npm run build` ✅ (no warnings)
  - **Pure tests:** silencedetect parsing; boundary snapping, using real drifted whisper output; dropping words in silence, tags, and unsure guesses; the real tone hallucination is rejected; DTW parsing and presets.
  - **Real whisper.cpp, end to end** (speech from macOS `say`):
    - Speech over silence starts within 0.5 s of the planned 3 s and 11 s.
    - Over constant background noise, "Two enemies on the stairs" lands within 0.6 s of the planned 20 s.
    - Nothing appears during the silences or the tone.
    - Text is found through `chunks_fts`, and the provenance row is written.
    - A re-run doesn't duplicate segments.
    - Speech is attached to Smart Clip suggestions with scores unchanged.
    - Silent audio gives "no speech" without running the model; no-audio is reported as such.
    - A missing model fails once with no retry; a simulated inference crash retries and then succeeds.
- **Live on :3001 with the worker:**
  - The 45 s voice-chat test recording gave 5 lines: 0:04 "Okay, I'm rotating to be sight." (said: "B site"), 0:06.9 "Two enemies on the stairs.", 0:22.2 "Nice, I got one." (said at 22.0 s), 0:23.9 "He's low.", 0:25.0 "I love him." (said: "finish him").
  - Both suggestions show the matching speech.
  - The 30 s steady-tone recording: "No speech detected".
  - Duplicate requests get "busy"; requests without the action header get 403.
- **Browser (CDP):** 13/13 checks.
  - Transcript lines and timestamps; the speech chip ✓; speech evidence and uncertainty on cards; titles still measurement-only.
  - Clicking a line seeks to 0:22 and plays, with the active line highlighted.
  - Quiet and not-transcribed states are correct; no horizontal scroll at 390 px; no console errors.
- **Regression:** 69/69, 27/27, 11/11, and the Smart Clip hub 3/3. The Phase 5 analysis tests pass.

### Known issues / limitations
- Your two OBS replay clips produced one line each: "drinks and saw me and we'll want a tea girl." (0:03.7) and "And we put it in." (0:05.7). Both are high-confidence transcriptions of real audio, but they may be game or music audio rather than speech. Please check them.
- No speaker labels. If OBS mixes mic and game audio on one track, both are transcribed together.
- Music or long sound effects can still produce plausible words. A Silero VAD model (about 1 MB) would reduce that; it isn't downloaded.
- The base.en model is English only. For other languages, use `ggml-base.bin` via `WHISPER_MODEL_PATH`.
- The :3001 dev server was restarted once (with approval) to load the new table.

---

## Phase 5 — Analysis + Smart Clip ✅ (2026-10-24)

Built on FFmpeg measurements only, as chosen: whisper.cpp isn't installed, there's no Whisper model, and there's no provider key. Speech and scene descriptions are reported as "not set up" everywhere (ADR 0013).

### Implemented
- **Analysis (5A)**, an `analyze` worker job that runs only when the user clicks **Find moments** (on a recording or on `/clips`). It runs locally, nothing is uploaded, and the UI says so.
  - EBU R128 loudness gives peaks above the previous 15 s, sudden jumps, and long silences.
  - `scdet` gives scene changes.
  - Up to 40 timestamped keyframes, evenly spaced plus the strongest scene changes.
  - Every event stores its measured evidence (LUFS, baseline, rise, scdet score). Times are file-relative, using ffprobe start offsets.
  - Status, stage, and per-signal availability are kept in `recording_analysis`; a missing audio track is reported as such.
  - Re-running replaces this recording's signals in one transaction. A second request while one is queued or running is refused. Failures retry once through the existing queue.
- **Smart Clip (5B):**
  - Transparent rules in a pure function: signals within 3 s are grouped; the score comes from listed rules ("Why this rank"); confidence is strong, moderate, or weak (strong needs both audio and picture evidence).
  - Clips get 6 s before and 4 s after the event, are 10–45 s long, and stay inside the video (shifted to keep their length).
  - Overlaps are merged or trimmed. At most 12 per recording, and none covering 85% or more of a recording.
  - Titles describe measurements ("Loud moment at 0:31"). Each suggestion says what the evidence can't tell ("can't tell what the sound was").
- **Recording page:**
  - The player gets a signal timeline: loud and sudden markers, picture changes, hatched silences, suggestion bars, and a playhead, with click to seek.
  - Signal chips show what was used: audio ✓, picture ✓, speech and scene descriptions "not set up".
  - Suggestion cards show a keyframe thumbnail, time range, confidence, evidence, uncertainty, and why-this-rank.
  - **Preview** plays exactly the clip's range, then stops.
  - **Adjust:** ±1 s, set to the playhead, or reset to suggested.
  - **Save clip:** a frame-accurate cut from the original goes into the Library through the Phase 2 pipeline (`origin: clip`, linked to its source and offset).
  - **Dismiss** and **Restore**. All decisions persist, and re-analysis never brings back dismissed or saved suggestions.
- **`/clips` hub** (new "Smart Clip" nav item, "Clips" on mobile): the strongest open suggestions across the library, recordings not analyzed yet (each with an explicit button), and saved clips.
- Recording details show the source (Imported, OBS replay buffer, OBS recording, Watched folder, Smart Clip); clips link back to the original.
- **Schema:** migration `0005`:
  - new tables `recording_analysis` and `clip_suggestions`;
  - new columns `audio_events.evidence_json` and `frames.scene_score`;
  - `recordings.parent_recording_id` and `parent_start_ms`;
  - new origin `clip` and event kinds `loudness_jump` and `scene_change`.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (102 tests; +13 analysis and Smart Clip) · `npm run build` ✅ (no warnings)
  - **Unit tests:** ebur128 and scdet parsing with offsets; peaks at the right times with evidence; steady and silent audio give no events; keyframe cap; one suggestion per event with an explained score; grouping and merging with no shared footage; boundaries at the start and end; no suggestions without signals; picture-only bursts are weak; near-whole-recording suggestions are skipped.
  - **Real FFmpeg, end to end:** bursts found at 5.5 s and 30.3 s (±0.9 s) with suggestions containing them; keyframe files at their timestamps; steady tone, silence, and no-audio recordings get no suggestions, with honest status; clips at 0:00 and at the end stay inside the video at full length.
  - Duplicate requests are refused. A simulated outage retries, and the re-run is idempotent.
  - Adjust validation works. Accept is idempotent and produces a real clip (origin `clip`, duration within 0.2 s, `ready`). Dismiss and save survive re-analysis.
- **Live on :3001 with the worker:**
  - A 60 s multi-event test video gave 5 peaks and 4 picture changes, about 0.3 s from the planned times, and 3 non-overlapping suggestions, including one from 0:00 and one to the very end.
  - The 30 s steady tone gave no suggestions.
  - The real OBS clips (26 s and 6 s) gave genuine loudness peaks but no suggestions ("already clip-length").
  - API: a duplicate request answers "busy"; a request without the header gets 403.
- **Browser (CDP):**
  - 3 cards with evidence, uncertainty, and honest chips.
  - Preview started at the range start and stopped at 36.60 s against an expected end of 36.5 s.
  - Adjusted and dismissed states persist after reload.
  - Save produced an 11.8 s clip that plays, labeled "Smart Clip cut from…".
  - Quiet, short, and not-analyzed states are correct. The `/clips` hub sections render.
  - No horizontal scroll at 390 px, and the mobile tab bar has Clips. No console errors.
- **Regression:** Phase 1/2 69/69 · Phase 2 27/27 · Phase 3 capture UI 10/10 (the "last clip" check is skipped when the last clip is older than 9 minutes) · folder sync unit tests pass.

### Known issues / limitations
- **No speech or visual understanding:** suggestions reflect loudness and picture change only, so quiet but important moments are missed. Adding whisper.cpp (`brew install whisper-cpp` plus the `ggml-base.en` model) or a vision provider (with a consent flow) feeds the same rules.
- Analysis decodes the whole video (scene detection); long recordings take a few minutes.
- A saved clip can't be adjusted afterwards. Remove it from the Library and save a new one.
- The :3001 dev server needed one restart (with approval) to load the new tables.
- Test videos from this phase ("Smart Clip test – …") and a saved test clip are in the Library and can be removed there.

---

## Phase 4 — Recording folder sync ✅ (2026-10-24)

### Implemented
- **Sources:**
  - "Watched folders" (generic or OBS) and "Medal recordings folder" are working cards.
  - Add a folder by pasting its path or with the native macOS chooser (Choose…); nothing is saved until you confirm.
  - A one-click "Watch OBS's folder" uses the path OBS reports.
  - Each folder has Rescan, Pause/Resume, Retry failed, and Remove (with a confirm step).
  - Status shown per folder: watching, scanning, paused, unavailable, or no permission (with macOS Privacy guidance), plus "worker offline".
  - Counts: in library, importing, couldn't import (by file name and reason), and no longer in folder.
- **Validation (`checkFolder`):**
  - Folders must exist and be resolved to their real path.
  - Not allowed: the disk root, home or account roots, system folders, `~/Library`, hidden folders, METAL's own data folder (or one containing it), or a folder overlapping one already watched.
  - The UI only ever sees `~/…` display paths and file names.
- **Worker `FolderSync`:**
  - An initial scan when the worker starts or a folder is added, which also catches files added while METAL was off.
  - Rescans every 15 s, or every 2 s while files are settling, and `fs.watch` triggers early rescans.
  - Skips symlinks, hidden files, non-video files, and anything deeper than 4 levels.
  - A file is complete once it's unchanged for 4 s or more; files OBS may still be recording into are deferred.
  - Renames are followed. Removed files are marked missing, and their recordings stay. A missing folder keeps its records and recovers when the folder returns.
  - Interrupted imports are re-queued.
- **`folder-import` job:**
  - Checks the path again: relative, no `..`, a regular file, realpath inside the folder.
  - Waits until the file is stable, then validates it with ffprobe. Invalid files get no recording; a freshly written file that isn't readable yet is re-checked for 60 s first.
  - Imports through the Phase 2 pipeline (read-only stream, sniffing, SHA-256 dedupe, poster, metadata, proxy). Recordings get `origin: folder`.
- **Dedupe across sources:**
  - Content hash, plus the server-only `recordings.source_path`.
  - Folder sync waits for an in-flight OBS auto-import of the same file, then links to it, and vice versa.
- **Shared code:** `src/server/media/local-file.ts` (path containment, link-by-source, read-only import, wait-until-stable), now also used by the Phase 3 OBS import.
- **Schema:** migration `0004` adds `watched_folders`, `folder_files`, `recordings.source_path`, and `capture_state.record_directory`. Documented in ADR 0012.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (89 tests; +13 folder sync against real files and real FFmpeg) · `npm run build` ✅ (no warnings)
  - The new tests cover:
    - folder validation (root, home, system, `~/Library`, hidden, data dir, file, missing, overlap);
    - initial scan with real metadata and poster, with the source byte-identical afterwards;
    - unsafe entries (symlinked file and folder, hidden, `.txt`);
    - a growing file, and a fresh unreadable file re-checked later;
    - duplicates (folder copy, and a manual upload found later in the folder);
    - rename, removal, corrupt and fake videos, and a tampered `../` path;
    - worker restart (offline addition, vanished job), unavailable folder and recovery, pause, OBS in-flight deferral and linking, and removing a folder.
- **Real files**, with the live worker and :3001 (test folder in the session scratchpad):
  - Initial scan imported a new clip: `ready`, 8 s, with a poster.
  - Copies of the two real Phase 3 OBS clips were linked as duplicates, not re-imported.
  - A file written in real time by FFmpeg waited until it was complete, then imported (`ready`, 6.1 s).
  - A rename was followed with no re-import. A fake `.mp4` was rejected with a reason. Symlinks to `~/Movies` and to another file were ignored.
  - A file added while the worker was stopped was imported on start.
  - Moving the folder away showed "Folder unavailable" and kept the records; moving it back resumed watching.
- **API:** root, `~`, `~/Library/Caches`, relative paths, the repo or data dir, and missing folders are all rejected with clear messages. Requests without the header get 403, cross-origin requests get 403, and an unknown folder gets 404.
- **Browser (CDP):**
  - Sources lists folders with counts, problem file names, and no absolute paths. The OBS-folder preset is offered.
  - Adding a Medal folder by path imported its clip. Pause, Resume, Rescan, and Remove with confirm all work. A rejected path shows the error.
  - The Library shows the folder imports. No horizontal scroll at 390 px; fixed a card overflow from long paths.
- **Regression:**
  - Phase 1/2: 69/69. The OBS assertions now follow the live replay-buffer state, and "Add folder" expects the live form.
  - Phase 2 checks: 27/27. The CSS-dependent "Demo memories" check now matches the heading's DOM text instead of its uppercased `innerText`.
  - Phase 3 browser checks: 11/11. Real OBS: a 4 s recording was auto-imported through the refactored path (`ready`, source recorded).

### Known issues / limitations
- **Not verified live:** watching OBS's real output folder (`~/Movies`, which holds unrelated videos) and clicking the native macOS chooser (it needs a person). Deduping between OBS and a watched folder is covered by unit tests, and by linking the real OBS clips copied into a test folder.
- The folder chooser is macOS-only; elsewhere, paste the path.
- Files are copied into METAL's library, not indexed in place, so storage grows with each import. Removing a folder keeps its recordings.
- Scans are capped at 4 levels deep and 20,000 files per folder.
- Test clips from this phase's real-file checks are in the Library. They can be removed there.

---

## Phase 3 — OBS capture ✅ (2026-10-24)

### Implemented
- **obs-websocket v5 client** (`src/server/capture/obs-client.ts`): the Hello/Identify handshake, SHA-256 challenge auth, requests with timeouts, events, and close-code mapping (4009 bad password, 4010 unsupported version).
- **Capture service in the worker** (ADR 0011):
  - connects from the saved settings and reconnects with backoff;
  - stops retrying after an auth failure;
  - mirrors OBS's real state into `capture_state`;
  - runs UI commands from `capture_commands`, which expire after 10 s.
- **Commands:** start and stop recording, start and stop the replay buffer, and save the replay.
  - Starting the buffer sets OBS's replay length (`RecRBTime`), but only while the buffer is stopped.
  - Save Clip reports success only after OBS's `ReplayBufferSaved` event.
- **Auto-import (`obs-import` job):**
  - Triggered by any replay save (from METAL or OBS's hotkey) and by any finished recording.
  - The path must be absolute, a regular file with an allowed extension (no symlinks), and its realpath must be inside OBS's recording folder. OBS must be on loopback.
  - The job waits for the file to stop changing, then imports it through the Phase 2 pipeline with dedupe. The source is recorded as `recordings.origin`.
- **API:**
  - `GET /api/capture`: live state with no secrets or paths.
  - `POST /api/capture/command`: same-origin plus custom header; returns 503 if the worker is offline, 409 if not connected, and 504 on timeout.
  - `GET` and `PUT /api/capture/config`: loopback only; the password is write-only and saved in a 0600 file under `data/`.
- **UI:**
  - The Home capture console runs on live state: REC timer, Start/Stop recording, replay buffer toggle, "Save last N", and clip status (saving → importing → processing → ready, with Open).
  - The Sources OBS card is a working connection form.
  - The sidebar and mobile status are live, and `/status` has a live OBS check.
  - Settings copy explains that quality, format, and hotkeys are set in OBS.
- **Schema:** migration `0003` adds `recordings.origin`, `capture_state`, and `capture_commands`.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (76 tests; +16 for capture against a fake obs-websocket server) · `npm run build` ✅
  - The capture tests cover the auth vector, handshake, wrong or missing password, unreachable OBS, request errors, and events.
  - They also cover service connect, no retry after an auth failure, record and replay commands with duration, confirmed save, hotkey-style saves, a refused save, drop and reconnect, expired commands, and no password in the view.
  - Path checks: outside folder, `..`, symlink, wrong extension, relative path. Also wait-until-stable.
- **Real OBS 32.1.1** on this Mac, through :3001 and the worker:
  - Wrong password is rejected with an honest error and no retry loop.
  - Start recording, then stop after ~6 s: the 6.3 s H.264/AAC MKV was imported automatically and is `ready` (`obs-recording`).
  - Replay buffer started at 30 s, then Save: OBS confirmed, and the clip (26.3 s; OBS trims to keyframes) was imported and is `ready` (`obs-replay`).
  - Both files have a poster and a proxy. Range 206 works, and the clip plays and seeks in the browser.
  - Disconnecting from METAL leaves OBS's replay buffer running; commands are refused with 409; reconnecting keeps the saved password.
  - Worker restart (a real socket drop): the UI shows "Worker offline" and commands get 503, then METAL reconnects automatically.
  - Stop replay buffer works. OBS was left as found: buffer off, not recording, replay length unchanged at 30 s.
- **Browser (CDP)**, desktop and 390 px:
  - Home, Sources, `/status`, and the mobile pill all show the live connection; controls are enabled.
  - The password field is never prefilled, and no secret appears in the HTML.
  - No console errors. Phase 1/2 regression is 69/69, after updating the eight assertions that expected the "not connected" placeholder.

### Known issues / limitations
- **The OBS Save Replay hotkey was not tested live**, because no hotkey is set in OBS. It uses the same `ReplayBufferSaved` event path as the Save button, which was verified live and in unit tests.
- Replay clips can run a few seconds shorter than the configured length, because OBS trims the buffer to keyframes.
- The worker must be running for capture. Remote OBS on another computer isn't supported (files must be on this disk).
- Quality, format, audio tracks, and hotkeys are configured in OBS, not METAL.
- The OBS password is stored in plain text in `data/obs-connection.json` (mode 0600, local only), not in the OS keychain.

---

## Phase 2 — Real video ingestion ✅ (2026-10-24)

### Implemented
- **Upload** (`POST /api/recordings`) — raw-body streaming into `data/media/.incoming`, SHA-256 while streaming, magic-byte check against the extension, 20 GB limit enforced mid-stream, Origin/Host check + custom header (no cross-site uploads). Import page uploads sequentially with real progress (XHR).
- **Dedupe** — unique `content_hash`; identical re-uploads are discarded and point to the existing recording ("Already in your library — skipped").
- **Ingest job** (worker, existing queue) — ffprobe metadata (duration, resolution, fps, container, codecs, creation time) → poster JPEG → H.264/AAC proxy only when the browser can't play the original → `ready`. Progress stages shown live. Corrupt/non-video files fail permanently (no retry) with a friendly message; no paths or raw tool output reach the UI.
- **Streaming** (`GET /api/media/:id/video|poster`) — by recording id only, single-range 206/416, `nosniff`, missing file → 404.
- **Library & Home** — "Your recordings" (real, polled while processing) above clearly separated "Demo memories"; Home shows real recent recordings, falling back to labeled demo ones.
- **Recording page** (`/recordings/:id`) — real player with seeking, details (codec, resolution, fps, size, playback source), processing/failed/missing-file states, honest "not analyzed yet", remove (deletes METAL's copy only).
- **Schema** — migration `0002`: `content_hash` (unique), `container`, `video_codec`, `audio_codec` (documented in ADR 0010). Dev server picks up new migrations after HMR.
- **Docs** — ADR 0009 (web-first, Electron deferred), ADR 0010 (ingestion), roadmap renumbered; UI phase references updated.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (60 tests; +13 media: range parsing, magic bytes, probe parsing/proxy decision, and an end-to-end ingest against real FFmpeg — MP4 as-is, MKV→H.264 proxy, dedupe, corrupt file, non-video rejection, path containment) · `npm run build` ✅
- On the dev server (:3001) with the worker: API upload of H.264 MP4, HEVC MKV, and a corrupt file; duplicate upload; cross-origin upload refused (403); Range 206, out-of-range 416, traversal-style id 404.
- Browser (CDP): UI import of a MOV + a duplicate → "Ready to watch" / "Already in your library"; real posters in Library; `<video>` metadata, seek to 5 s, and playback advance for the MP4 and the MKV proxy; failed and missing-file states; remove → back to Library; no paths in the UI; no horizontal scroll at 390 px; no console errors.

### Known issues / not yet done
- The worker must be running for imports to finish (`npm run dev:all`, or `npm run worker` next to `npm run dev`); the import page says when processing is paused.
- Recall, Time Machine, and Studio still use demo fixtures until analysis (Phases 5–6).
- Uploads go one file at a time; there's no cancel button mid-upload yet.

---

## Phase 1b — Desktop capture UX ✅ (2026-10-23)

### Implemented
- **Capture-first Home** (`/`):
  - capture console: OBS status, REC indicator, Start recording, and Save last *N* (the length follows the replay-buffer setting) with its hotkey;
  - AI Smart Clip entry, quick access to Recall, Time Machine and Studio, Recall search, recent recordings and saved moments (demo-labeled).
- **Sources** (`/sources`):
  - OBS card with setup steps; host, port and password fields;
  - watched folders (finished-file, dedupe and read-only rules);
  - local Medal recordings folder (no account, no cloud, not affiliated, never modified);
  - manual import (links to the working `/import`).
- **Capture settings** (`/settings`):
  - replay buffer length (15 s–5 min) with a clip-size estimate;
  - quality presets (720p60 / 1080p60 / 1440p60) and MKV/MP4 guidance;
  - hotkey recorder: Electron-style accelerators; it rejects keys without a modifier, conflicts and reserved combos;
  - audio options, with the separate mic track depending on the mic.
- **Desktop shell:**
  - nav now leads with Capture;
  - Sources and Capture settings added to the sidebar and ⌘K;
  - sidebar capture-status card and mobile header status pill (replaces the mobile Import shortcut; Import stays in Sources and ⌘K);
  - `/status` gains a "Capture (OBS)" check.
- **Logic:**
  - `src/lib/capture/settings.ts`: zod-validated preferences with per-field fallback, hotkey capture/validation, size estimates;
  - `src/lib/capture/status.ts`: the capture-state contract, fixed to `not-connected` until Phase 4;
  - settings persist per device in `localStorage` via `useSyncExternalStore`, with SSR defaults and guarded storage access.

### Honesty
- Start recording, Save clip, Connect to OBS, Add folder and Choose Medal folder are disabled. Each one points to an explanation of what's missing and which phase adds it.
- No recording timer or "recording" state is ever shown.
- The settings page states that preferences take effect only once OBS is connected.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (47 tests; +10 for capture settings and hotkeys) · `npm run build` ✅
- Browser scenario against the dev server (:3001): 69 checks pass.
  - **Phase 1b checks:**
    - capture controls are disabled and say nothing is recording;
    - replay length and hotkey persist and show up on Home;
    - hotkey conflicts and missing modifiers are rejected;
    - the mic/separate-track dependency works;
    - reset restores the defaults;
    - the Sources controls are disabled and the import link works;
    - `/status` shows the OBS check;
    - no horizontal scroll at 390 px on `/sources` and `/settings`.
  - All Phase 1 checks still pass.

### Known issues / not yet done
- No Electron, OBS, folder watching or recording yet (Phases 2, 4, 5).
- Settings live in this browser's storage until the desktop shell persists them.
- The OBS password field is display-only; the desktop app will keep it in the system keychain.

---

## Phase 1 — Cinematic UI ✅ (2026-10-23)

### Implemented
- **Data layer** — contracts (`src/lib/memory/contracts.ts`) and a `MemoryRepository` with a demo implementation over fictional fixtures: 5 games, 5 sessions, 13 recordings, ~26 moments. Labeled keyword search with stemming (ADR 0008).
- **Pages** — Home (cinematic hero, highlights, three ways in, featured sessions), Library (grid/list, filters, detail sheet), Recall (search, filters, evidence, inline player), Time Machine (session explorer, session detail with multi-lane timeline and keyboard moment stepping, full-screen Relive), Story Studio (clip timeline with drag + keyboard reorder, trim, captions, 16:9 / 9:16 / 1:1, sequenced preview, undo/redo, Export dialog), Import (drag-drop validation, local previews), branded 404 and error pages.
- **Media** — procedural SVG poster art (`SceneArt`), a player with simulated playback for fixtures and a real `<video>` path for future media.
- **Motion** — React View Transitions (shared session-art morph, directional nav), Motion animations, global `MotionConfig reducedMotion="user"`.
- **Branding** — METAL icon (`src/app/icon.svg`); create-next-app favicon and starter SVGs removed (approved).
- **Honesty** — "Demo data" badges on every fixture surface. Simulated playback and keyword-only search are labeled. Render MP4, Import and natural-language edits are disabled with explanations. The edit list downloads as real JSON.
- **Docs** — ADR 0007 (desktop direction) and ADR 0008 (demo fixtures).

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (37 tests: edit-list operations, repository/search, import validation, plus Phase 0 suites) · `npm run build` ✅
- Browser scenario (headless Chrome via CDP, against the dev server on :3001 and a production build): 48 checks pass. Coverage:
  - navigation and the ⌘K palette;
  - Recall queries and evidence;
  - timeline keyboard stepping and `?moment=` deep links;
  - Relive;
  - Studio reorder/trim/remove/undo/aspect/export dialog;
  - import validation;
  - 404s;
  - no horizontal scroll at 390 px on every page;
  - reduced motion.
- Remaining console output is expected only: the 404 resource log for an unknown route, and Motion's dev notice when reduced motion is emulated.

### Fixed during Phase 1 verification
- Hydration mismatches in dev: `SceneArt` shared one random generator across child components, so React's dev double-render drew different geometry. Each scene now seeds its own generator.
- Relive hydration mismatch under reduced motion: initial animation targets no longer depend on `useReducedMotion` (unknown during SSR).
- `/sessions/[id]` and `/relive` read `params` outside `<Suspense>` (instant-navigation insight); content now renders inside a Suspense boundary. Known sessions still prerender in full.
- Timeline: recording labels were covered by moment markers (labels now sit above the bars). Library filter collapsed on mobile. Player badge clipped on narrow players (shortened to "Simulated · no video"). Arena art and the Home hero were too dark.

### Known issues / not yet done
- All content is demo fixtures. No real import, analysis, search or export yet (Phases 3–8).
- Unknown session ids render the 404 page inside a streamed boundary, so the HTTP status is 200 rather than 404. This doesn't matter for the local desktop app.
- `src/components/ui/coming-soon.tsx` is unused (kept).
- The Home page is search-first; it becomes capture-first in Phase 1b.

---

## Phase 0 — Foundation ✅ (2026-10-23)

### Implemented
- **Database** — SQLite (`better-sqlite3`) + Drizzle. Full MVP schema in `src/server/db/schema.ts`: recordings, jobs, workers, ai_outputs (provenance), transcript_segments, frames, visual_observations, audio_events, moments, chunks, sessions, story_projects, story_clips, story_edits, exports. Migrations in `drizzle/` apply automatically on open; `0001_chunks_fts.sql` adds the FTS5 index + sync triggers. WAL + foreign keys + busy timeout.
- **Job queue** — `src/server/jobs/queue.ts`: enqueue, atomic FIFO claim, progress/heartbeat, retry-until-max-attempts, stale-job recovery, worker liveness.
- **Worker** — `src/worker/index.ts`: polls the queue, heartbeats every 2 s, dispatches to a handler registry (empty until Phase 1), fails unknown job kinds clearly, graceful SIGINT/SIGTERM shutdown.
- **Health checks** — `src/server/health.ts`: library storage/DB, worker liveness, ffmpeg/ffprobe, whisper.cpp + model, Claude API key presence (never the value). Each check reports state, detail, fix, and affected features.
- **App shell** — root layout with sidebar (desktop), top bar + bottom tab bar (mobile), skip link, Suspense-wrapped active nav state (Cache Components safe).
- **⌘K command palette** — Radix Dialog + Motion; ⌘K/Ctrl+K toggle, arrow-key navigation, Enter to run, jump to any section, "Search memories for …" routes to `/recall?q=`. Reduced-motion aware.
- **Design system** — graphite surface scale, electric-violet accent, Geist + Geist Mono + Instrument Serif display italic, glass utility, focus rings, global reduced-motion rule. Original METAL logo mark + wordmark.
- **Pages** — `/` hero + live library state (empty state → Import); `/status` live health dashboard with re-check; `/api/health` JSON; honest "Arrives in Phase N" placeholders for `/import`, `/recall`, `/sessions`, `/studio`.
- **Tooling** — scripts `typecheck`, `test`, `test:watch`, `worker`, `dev:all`, `db:generate`; Vitest config; `.env.example`; `.gitignore` excludes `data/`, `*.db*`, `.env*` (except `.env.example`).
- **Docs** — ADRs 0001–0006, this file, `CLAUDE.md`.

### Verified
- `npm run typecheck` ✅ · `npm run lint` ✅ · `npm test` ✅ (14 tests) · `npm run build` ✅ (no warnings)
- Tests cover: queue FIFO/claim-once, progress clamping, retry → fail, stale-job reclaim, worker liveness, FTS5 sync (insert/stem match/delete), migrations on a fresh DB, health checks (missing binaries, degraded AI, no secret leakage), and the real worker process (startup, heartbeat, unknown-kind failure, clean SIGINT shutdown).
- Production server (`next start`) + worker: `/api/health` reports storage ✅, worker ✅ online, ffmpeg ❌, whisper ⚠️, Claude ⚠️ (as expected on this machine); all routes 200, unknown route 404.
- Visual check via headless Chrome at 1440 px and 390 px.

### Fixed during Phase 0
- FIFO tie-break bug (same-millisecond jobs ordered by random id) → order by `rowid`.
- Circular Drizzle type inference (recordings ↔ sessions ↔ ai_outputs ↔ jobs) → `AnySQLiteColumn` annotation.
- Build tracing warning on runtime data path → `turbopackIgnore` comment.
- Logo mark invisible on mobile (duplicate SVG gradient id inside hidden sidebar) → per-instance `useId`.

### Known issues / not yet done
- FFmpeg and whisper.cpp are not installed yet (`brew install ffmpeg whisper-cpp`; whisper model into `data/models/`). Import/analysis/export depend on them.
- `ANTHROPIC_API_KEY` not configured (`.env.local`).
- ⌘K palette verified by type check/lint/build and rendering, not yet by an automated browser interaction test.
- npm audit: 4 moderate findings, all one advisory (GHSA-67mh-4wv8-2f99, esbuild dev-server CORS) via `drizzle-kit`'s legacy `@esbuild-kit` loader. Dev-only, never serves HTTP, not in the app bundle. The suggested fix downgrades drizzle-kit to 0.18 (breaking) — no action taken; revisit when drizzle-kit drops `@esbuild-kit`.
- Starter assets in `public/` and `src/app/favicon.ico` are still the create-next-app defaults (left in place; removal needs approval).
