# 0005 — Hybrid retrieval: brute-force vectors + FTS5

**Status:** Accepted (Phase 0 schema; implementation in Phase 3)

## Context
The demo dataset is small (thousands of chunks at most). Native vector extensions add install risk.

## Decision
- `chunks` stores retrieval text (transcript, visual captions, moment summaries) with a Float32 embedding BLOB.
- Vector search is brute-force cosine similarity in JS.
- Keyword search uses an external-content **FTS5** table `chunks_fts` (porter stemming), kept in sync by triggers (`drizzle/0001_chunks_fts.sql`).
- Results are merged with Reciprocal Rank Fusion and grouped into moments.

## Consequences
- Millisecond search at demo scale with no native extensions beyond SQLite's built-in FTS5.
- Revisit (e.g. sqlite-vec) only if the dataset grows by orders of magnitude.
