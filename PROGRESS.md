# METAL — Progress

> "Every moment has a story."

Roadmap and acceptance criteria: see the approved plan (phases 0–7). Architecture decisions: [`docs/decisions/`](docs/decisions/README.md).

| Phase | Status |
|---|---|
| 0 Foundation | ✅ Complete |
| 1 Import & playback | ⏳ Not started |
| 2 Analysis pipeline | ⏳ Not started |
| 3 Recall | ⏳ Not started |
| 4 Time Machine | ⏳ Not started |
| 5 Story Studio | ⏳ Not started |
| 6 Polish & demo hardening | ⏳ Not started |
| 7a Wrapped *(stretch)* | ⏳ Not started |
| 7b Multi-POV *(stretch)* | ⏳ Not started |

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
