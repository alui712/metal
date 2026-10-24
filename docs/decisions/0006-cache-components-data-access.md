# 0006 — Data access under Cache Components

**Status:** Accepted (Phase 0)

## Context
`cacheComponents` and `partialPrefetching` are enabled. Next.js 16 treats synchronous reads (including `better-sqlite3`) as predictable and would freeze them into the prerendered shell.

## Decision
- Server-side read helpers (`src/server/library.ts`, etc.) call `await connection()` before querying, and the components that use them render inside `<Suspense>` with skeleton fallbacks.
- Client components that read the URL (`usePathname`) are wrapped in `<Suspense>` with a static fallback (see the sidebar/tab bar in `src/app/layout.tsx`).
- Mutable library data is not wrapped in `"use cache"`.

## Consequences
- Pages ship a static shell instantly and stream live library data (`◐ Partial Prerender` in build output).
- Forgetting `connection()` causes stale prerendered data — check build output when adding pages.
