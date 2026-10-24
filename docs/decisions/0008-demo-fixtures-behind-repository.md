# 0008 — Demo fixtures behind a repository interface

**Status:** Accepted (Phase 1)

## Context
The UI had to be built and judged before ingestion and analysis exist, without ever presenting invented content as real.

## Decision
- Every screen reads through `MemoryRepository` (`src/lib/memory/repository.ts`) using the contracts in `src/lib/memory/contracts.ts`. Phase 1 ships a demo implementation over fictional fixtures (`src/lib/memory/demo/`); a database-backed implementation replaces it later without UI changes.
- Fixture-backed surfaces carry a visible "Demo data" badge; simulated playback, keyword-only search, and disabled actions (Render MP4, Import, natural-language edits) say exactly what is missing. Poster art is procedural SVG (`SceneArt`), deterministic per fixture, with no game assets.
- Story Studio edits are pure edit-list operations (`src/lib/studio/edl.ts`) with undo history, shared by the preview now and the FFmpeg export later.

## Consequences
- Swapping in real data is a repository change plus removing badges where data becomes real.
- Client components that draw from seeds must stay deterministic across server and client renders (each scene seeds its own generator).
