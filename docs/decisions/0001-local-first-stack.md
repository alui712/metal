# 0001 — Local-first stack

**Status:** Accepted (Phase 0)

## Context
METAL is a hackathon MVP demoed on a single laptop (Apple M4, 16 GB). All video comes from explicitly imported local files. The demo must work reliably without depending on hosted infrastructure or private Medal APIs.

## Decision
- **Next.js 16 App Router** (TypeScript strict, Tailwind v4 via the Turbopack loader) for UI and server.
- **SQLite** via `better-sqlite3` with **Drizzle ORM**. Migrations are generated into `drizzle/` with `npm run db:generate` and applied automatically when a connection opens (`src/server/db/client.ts`). Custom SQL migrations (e.g. FTS5) use `drizzle-kit generate --custom`.
- WAL mode, foreign keys on, `busy_timeout=5000` (the web server and worker share the file).
- All runtime data lives under `data/` (gitignored; overridable with `METAL_DATA_DIR`): `metal.db`, `media/<recordingId>/…`, `exports/`, `models/`.

## Consequences
- Zero infrastructure; the whole demo runs offline except Claude calls.
- `better-sqlite3` is a native module; Next.js externalizes it automatically.
- Single-writer SQLite is fine at demo scale; not designed for multi-user hosting.
