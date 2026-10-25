# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

METAL — "Every moment has a story." A local, web-first gameplay recording and clipping app (Next.js server + worker on localhost; recording via OBS through obs-websocket; Electron deferred — ADR 0009) that turns recordings into AI Smart Clips, searchable memories (Recall), session timelines (Time Machine), and FFmpeg-rendered montages (Story Studio). Imported recordings are real (ADR 0010); Recall, Time Machine, and Story Studio run on them (ADRs 0015–0017), while `/recall/demo`, `/sessions/demo`, and `/studio?demo=1` keep labeled demo fixtures behind `MemoryRepository` (ADR 0008). Original branding; not affiliated with Medal and must not use Medal assets or APIs. Work is phase-gated — check `PROGRESS.md` for the current phase and don't start the next phase without the user's go-ahead. Record architectural decisions in `docs/decisions/`.

## Next.js version warning

This project runs **Next.js 16.4 / React 19.3**, which is newer than most training data. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (`01-app/` covers the App Router). `middleware` is now `proxy`.

## Commands

- `npm run dev:all` — Next dev server (http://localhost:3000) + background worker together
- `npm run dev` / `npm run worker` — run them separately
- `npm run typecheck` — `next typegen && tsc --noEmit`
- `npm run lint` — ESLint 9 flat config
- `npm test` — Vitest (all `src/**/*.test.ts`); single file: `npx vitest run src/server/jobs/queue.test.ts`; single test: add `-t "name"`
- `npm run build` — production build; check the route table for `◐`/`○`/`ƒ`
- `npm run db:generate` — generate a migration after editing `src/server/db/schema.ts` (custom SQL: `npx drizzle-kit generate --custom --name <name>`)

Run typecheck, lint, test, and build before every phase checkpoint commit.

## Architecture

- **Two processes.** The Next.js app serves UI and reads the DB; a separate worker (`src/worker/index.ts`) runs long jobs (transcode, analysis, export) from a SQLite `jobs` table (`src/server/jobs/queue.ts`). Register handlers by job kind in `src/worker/handlers.ts`. `/status` shows whether the worker is heartbeating.
- **`server-only` boundary.** Modules imported by the worker (`src/server/{config,db,jobs,ids}` and future `media/`, `pipeline/`, `ai/`) must NOT import `server-only` — it throws outside RSC. Next-only modules (`health.ts`, `library.ts`) do. Vitest aliases `server-only` to an empty module.
- **Data.** SQLite + Drizzle; migrations in `drizzle/` apply automatically in `openDb()`. `getDb()` is an HMR-safe singleton; tests use `openDb(":memory:")`. All runtime data lives in `data/` (gitignored, override with `METAL_DATA_DIR`). `chunks_fts` is an FTS5 table synced by triggers — don't write to it directly.
- **Cache Components.** `cacheComponents` + `partialPrefetching` are on. Server reads must call `await connection()` before synchronous SQLite queries (otherwise they get prerendered) and render inside `<Suspense>`. `usePathname` consumers need a Suspense boundary with a static fallback (see `src/app/layout.tsx`).
- **Media.** Uploads stream into managed storage (`src/server/media/`); paths in the DB are relative to `data/media` and resolved only via `managedPath()`. Run FFmpeg/ffprobe with argument arrays (`execFile`/`spawn`), never a shell. Media is served by recording id from `/api/media/:id/:variant`. The worker must run for imports to finish.
- **Capture.** The worker owns the single obs-websocket connection (`src/server/capture/`, ADR 0011): state goes to `capture_state`, UI commands come through `capture_commands` via `POST /api/capture/command`, and OBS save/stop events queue validated `obs-import` jobs. The OBS password lives only in `data/obs-connection.json` (0600) and is never returned by an API.
- **Watched folders.** The worker's `FolderSync` (`src/server/sources/`, ADR 0012) tracks files in `folder_files` and queues `folder-import` jobs; folders are only added through `checkFolder()`. Local files enter the library only via `src/server/media/local-file.ts` (containment check + read-only stream into `receiveUpload`). Never write to or delete source files.
- **Analysis & Smart Clip.** `analyze` jobs (`src/server/analysis/`, ADR 0013) store FFmpeg-measured signals in `audio_events`/`frames` and rebuild suggestions via the pure rules in `src/server/smartclip/candidates.ts`; accepted clips are cut by `clip-export` and enter the library through `receiveUpload`. Analysis runs only on explicit user action; never label loudness as laughter or game events.
- **Transcription.** `transcribe` jobs (`src/server/analysis/transcribe.ts`, ADR 0014) run local whisper-cli (model: `WHISPER_MODEL_PATH` → `models/` → `data/models/`); segments are snapped to FFmpeg-measured sound and filtered by `SPEECH_RULES`, stored in `transcript_segments` and mirrored into `chunks`. Speech is evidence only in Smart Clip, never scoring or titles.
- **Recall.** `/recall` searches real transcripts via `src/server/search/recall.ts` (FTS5 + local MiniLM embeddings in `chunks.embedding`, ADR 0015); the demo lives at `/recall/demo`. Flagged lines (`flagged_at`) are removed from `chunks`. Models live in gitignored `models/`; transformers.js runs with remote loading disabled.
- **Visual Recall.** `visual-index` worker jobs (`src/server/visual/`, ADR 0022) sample frames (2 s + hard cuts, exact pts via showinfo) and embed them with local CLIP (`Xenova/clip-vit-base-patch16` in `models/`) into `visual_frames`; opt-in via `POST /api/recordings/:id/visual`. `/api/recall` merges `searchVisual` (only with `?visual=1`, the Recall "Scenes · experimental" toggle) with transcript search (`mergeRecall`). Visual matches are always labelled approximate (`VISUAL_RULES` tiers) and never claim actions or events. Setup and accuracy: `docs/visual-recall.md`.
- **Time Machine.** Sessions come from `src/server/timemachine/sessions.ts` (ADR 0016): `syncSessions` clusters by `recorded_at` (never import time; `recorded_at_source` says where it came from, `file-date` = approximate) and leaves `locked` sessions/recordings alone. Grouping edits go through `editSession`; Relive is the pure reducer in `src/lib/timemachine/relive.ts`; `/studio?story=` loads real stories via `storyView`. Demo sessions live at `/sessions/demo`. Read→write SQLite transactions that can race the worker use `.immediate()`.
- **Story Studio.** Real stories live in `story_projects`/`story_clips` (`src/server/studio/stories.ts`, ADR 0017); the editor autosaves via `PUT /api/stories/:id`. Exports are `story-export` worker jobs (`src/server/studio/render.ts`): one FFmpeg pass that normalizes every clip and forces exact A/V length per clip, verified with ffprobe before `exports.status = succeeded`; files live only in `data/exports/<exportId>.mp4` and are served by `/api/exports/:id`. This FFmpeg has no drawtext/libass, so captions are burned in as sharp-rendered PNG overlays (ADR 0018; layout shared with the preview in `src/lib/studio/caption-layout.ts`) and also kept as a `mov_text` track. Relive double-buffers two `<video>` slots so cuts across recordings crossfade. Demo editor: `/studio?demo=1`.
- **Multi-POV.** `src/server/pov/` (ADR 0019): `pov-match` worker jobs align shared audio (spectral flux + FFT cross-correlation, `SYNC_RULES`), candidates come only from overlapping clocks / game / reliable audio, and only the user pairs. Groups live in `pov_groups`/`pov_members` (group time = own time + `offset_ms`; offsets are suggested until confirmed or nudged); the viewer is `/povs/[id]`. Time mapping is `src/lib/pov/sync.ts`.
- **No fabrication.** AI outputs go through provider adapters (`src/server/ai/`, from the analysis phase) and are recorded in `ai_outputs` with input references; the UI must show honest unavailable states, never invented content. Secrets are read only in server modules.
- **Styling.** Tailwind v4 through the Turbopack loader (no PostCSS config). Design tokens (graphite surfaces, violet accent, `font-display` serif) are defined in `src/app/globals.css` under `@theme inline`; use those token classes (`bg-surface-2`, `text-ink-muted`, `text-accent-ink`, `border-line`) rather than raw colors. Dark-only. Shared page primitives are in `src/components/ui/page.tsx`. Respect `useReducedMotion` for Motion animations.
