# METAL — Progress

> "Every moment has a story."

Product: a standalone **desktop** gameplay recording and clipping app (Electron + this Next.js app; recording via OBS). Final submission: a 3-minute 1080p demo — Capture → AI Smart Clip → Recall → Time Machine → Story Studio. Architecture decisions: [`docs/decisions/`](docs/decisions/README.md) (desktop direction: ADR 0007).

| Phase | Status |
|---|---|
| 0 Foundation | ✅ Complete |
| 1 Cinematic UI (demo fixtures) | ✅ Complete |
| 1b Desktop-first UX (capture home, Sources, capture settings) | ✅ Complete |
| 2 Electron shell (secure preload, server + worker lifecycle) | ⏳ Not started |
| 3 Ingestion (fingerprint/dedupe, probe, proxy, thumbnails, streaming) — needs FFmpeg | ⏳ Not started |
| 4 OBS capture (record, replay buffer, Save Clip, hotkey, auto-import) | ⏳ Not started |
| 5 Local folder connector | ⏳ Not started |
| 6 Analysis + AI Smart Clip — needs whisper.cpp | ⏳ Not started |
| 7 Real Recall & Time Machine (DB-backed repository) | ⏳ Not started |
| 8 Story Studio export (FFmpeg, natural-language edits) | ⏳ Not started |
| 9 Polish & 3-minute demo | ⏳ Not started |
| Stretch: Wrapped, Multi-POV | ⏳ Not started |

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
