# 0020 — Judge Experience: showcase, guided tour, real-data spotlight

**Status:** Accepted (Judge Experience)

## Context
First-time viewers (judges) need to understand METAL in about ten seconds and reach the four headline features (Recall, Time Machine, Multi-POV, Story Studio) without knowing the app. Every highlighted item must be real: no invented moments, searches or stories.

## Decision
- **`/showcase`** is a full-bleed landing page (logo reveal, the "The game ends. The moment doesn’t." headline, real footage fan, four feature cards). It has no splash screen and no sound. App chrome is hidden with CSS (`body:has([data-immersive]:not([style*="display: none"])) [data-shell]`), so the prerendered page never flashes the sidebar. The `:not(...)` matters: with Cache Components, Next keeps the previous route mounted in a hidden `<Activity>` (`display: none !important` on its root), and without it the sidebar stayed hidden after leaving the showcase.
- **Spotlight data** (`src/server/judge/spotlight.ts`, read-only, `cache()` per request) picks:
  - the night with the most moments;
  - a real, short, clean transcript line for Recall (`pickRecallLine`);
  - the latest POV group;
  - the latest story.
  Each card and tour stop has an honest empty state and a fallback to the feature's index page (`tourSteps`).
- **Showcase footage** is the featured night's recordings ranked by poster vividness (colourfulness × luminance, via sharp, memoised per file mtime). This is an image measurement used only to choose an attractive cover. It is never presented as a quality or "best play" judgement. Generated filenames are not shown as titles.
- **Guided tour** state lives in `sessionStorage` (`useSyncExternalStore`, server snapshot `null`), so it survives navigation but not a new visit. A dock in the root layout shows the step, a tip describing controls that exist on that page, Back/Next, a link home to the showcase, minimise and end. While the dock is open, `#main` gets extra bottom padding so content can scroll clear of it.
- No backend, worker, OBS, ingestion or AI changes.

## Consequences
- The tour depends on route paths (`onStep`). Renaming a feature route means updating `tourSteps`.
- `next dev` on this machine full-reloads in a loop while the worker writes SQLite (Turbopack sees WAL churn); use the production build for demos and screenshots.
