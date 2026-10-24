# 0003 — Hybrid AI stack; grounded results with provenance

**Status:** Accepted (Phase 0; implementation in Phase 2+)

## Context
METAL must never fabricate AI results or exports, must keep secrets server-side, and must stay usable when model services are unavailable.

## Decision
- **Claude API** (server-side only) for frame analysis, titles/summaries, and natural-language edit plans. **whisper.cpp** (local CLI) for transcription. **Local embeddings** (transformers.js) for semantic search. Each sits behind a provider interface in `src/server/ai/`.
- Every model output is stored in `ai_outputs` with provider, model, prompt version, input references, and job id. Derived rows (`visual_observations`, `sessions`, `story_edits`) point at it.
- Model outputs are validated with zod schemas; references to timestamps/frames that weren't in the input are discarded.
- When a service is unavailable, the UI shows an honest unavailable/not-yet-analyzed state and deterministic fallbacks (e.g. "Valorant · Oct 23 · 42 min"), never invented text.
- `ANTHROPIC_API_KEY` is read only in server modules; no `NEXT_PUBLIC_` variables carry secrets. Health checks report presence, never values.

## Consequences
- Search keeps working offline on transcript + audio signals.
- Every claim in the UI can show its evidence.
