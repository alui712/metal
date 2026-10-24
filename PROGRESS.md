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
| 6 Real Recall & Time Machine (DB-backed repository) | ⏳ Not started |
| 7 Story Studio export (FFmpeg, natural-language edits) | ⏳ Not started |
| 8 Polish & 3-minute demo | ⏳ Not started |
| Stretch: Wrapped, Multi-POV · Desktop packaging (Electron) | ⏳ Not started |

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
