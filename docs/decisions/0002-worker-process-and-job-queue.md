# 0002 — Separate worker process and SQLite job queue

**Status:** Accepted (Phase 0)

## Context
Import, transcoding, transcription, visual analysis, and export can take minutes. Running them inside Next.js request handlers is fragile: requests time out, and the dev server's HMR can re-run module code and spawn duplicate background loops.

## Decision
- A standalone worker (`src/worker/index.ts`, run with `npm run worker`, or alongside Next with `npm run dev:all`) polls the `jobs` table.
- Queue operations live in `src/server/jobs/queue.ts`:
  - `claimNextJob` runs in an `IMMEDIATE` transaction and claims the oldest queued job (FIFO by `created_at`, then `rowid`).
  - Running jobs whose heartbeat is older than 60 s are re-queued (if attempts remain) or failed.
  - `failJob` re-queues until `max_attempts`, then marks the job failed with its error.
- The worker writes a heartbeat to `workers` every 2 s; `/status` treats >10 s as offline. On SIGINT/SIGTERM it removes its row and exits.
- Handlers register by job kind in `src/worker/handlers.ts`. Unknown kinds fail with a clear error.
- **Module boundary:** code under `src/server/` that the worker imports (config, db, jobs, media, pipeline) must not import `server-only` (that package throws outside React Server Components). Modules only used by Next.js (e.g. `health.ts`, `library.ts`) do import it.

## Consequences
- Long jobs survive page reloads and dev-server restarts; the UI reads job state from the DB.
- Two processes must be running for import/analysis/export; `/status` makes that visible.
- Handlers must be idempotent/resumable because a job can be re-run after a crash.
