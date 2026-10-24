# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

METAL — "Every moment has a story." A local, web-first gameplay recording and clipping app (Next.js server + worker on localhost; recording via OBS through obs-websocket; Electron deferred — ADR 0009) that turns recordings into AI Smart Clips, searchable memories (Recall), session timelines (Time Machine), and FFmpeg-rendered montages (Story Studio). Imported recordings are real (ADR 0010); Recall, Time Machine, and Studio still run on labeled demo fixtures behind `MemoryRepository` (ADR 0008) until analysis exists. Original branding; not affiliated with Medal and must not use Medal assets or APIs. Work is phase-gated — check `PROGRESS.md` for the current phase and don't start the next phase without the user's go-ahead. Record architectural decisions in `docs/decisions/`.

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
- **No fabrication.** AI outputs go through provider adapters (`src/server/ai/`, from the analysis phase) and are recorded in `ai_outputs` with input references; the UI must show honest unavailable states, never invented content. Secrets are read only in server modules.
- **Styling.** Tailwind v4 through the Turbopack loader (no PostCSS config). Design tokens (graphite surfaces, violet accent, `font-display` serif) are defined in `src/app/globals.css` under `@theme inline`; use those token classes (`bg-surface-2`, `text-ink-muted`, `text-accent-ink`, `border-line`) rather than raw colors. Dark-only. Shared page primitives are in `src/components/ui/page.tsx`. Respect `useReducedMotion` for Motion animations.
