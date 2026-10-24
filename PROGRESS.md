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
| 8 Polish & 3-minute demo | ⏳ Not started |
| Stretch: Wrapped, Multi-POV · Desktop packaging (Electron) | ⏳ Not started |

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
