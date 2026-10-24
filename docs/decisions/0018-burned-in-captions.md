# 0018 — Burned-in captions via SVG → PNG overlays

**Status:** Accepted (Phase 8A)

## Context
Phase 7 exported captions only as a `mov_text` subtitle track, which many players hide by default. This FFmpeg build has no `drawtext`, `subtitles` or libass, and no SVG decoder. Installing another FFmpeg was out of scope, because it would change the system.

## Decision
- **Rendering.** `sharp` is already installed (a dependency of Next and transformers.js), so the worker draws each clip's caption box as SVG and rasterizes it to a PNG next to the export (`<exportId>.capN.png`). FFmpeg composites the PNGs after the concat with `overlay=…:enable='between(t,start,end)'`, one per captioned clip. The PNGs are deleted in `finally`.
- **The subtitle track stays.** `mov_text` is still muxed, so the burn-in is additive.
- **Fallback.** If `sharp` can't load, the export goes ahead without burn-in, using the subtitle track only.
- **One layout for preview and export.** Both use `src/lib/studio/caption-layout.ts`:
  - font is 4.6 % of the shorter side;
  - bottom offset depends on the aspect ratio;
  - the same word wrap, at most 3 lines, with "…" when cut.
  
  The Studio preview renders those exact lines in container-query units, so the preview and the MP4 break lines identically.
- **Text is untrusted.** It is XML-escaped before going into the SVG and never passed to a shell or to the FFmpeg filter graph. Only file paths and numeric times are.

## Consequences
- `sharp` is used as a transitive dependency rather than declared in `package.json`. If Next ever drops it, the fallback keeps exports working, with no burn-in.
- Glyph widths are estimated, so very wide fonts could wrap slightly differently from the estimate. The box is sized generously and capped at 88 % of the width.
