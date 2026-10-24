# 0020 — Judge Experience: showcase, guided tour, real-data spotlight

**Status:** Accepted (Judge Experience)

## Context
First-time viewers (judges) need to understand METAL in about ten seconds and reach the four headline features (Recall, Time Machine, Multi-POV, Story Studio) without knowing the app. Every highlighted item must be real: no invented moments, searches or stories.

## Decision
- **`/showcase`** is a full-bleed landing page (logo reveal, the "The game ends. The moment doesn’t." headline, real footage fan, four feature cards). It has no splash screen and no sound. App chrome is hidden with CSS (`body:has([data-immersive]:not([style*="display: none"])) [data-shell]`), so the prerendered page never flashes the sidebar. The `:not(...)` matters: with Cache Components, Next keeps the previous route mounted in a hidden `<Activity>` (`display: none !important` on its root), and without it the sidebar stayed hidden after leaving the showcase.
- **Approved demo list** (Cycle 1). Judge-facing content comes only from `data/judge-demo.json`, which sits beside the database (override with `METAL_JUDGE_DEMO`; example in `docs/judge/`). It lists:
  - the night;
  - the recordings, in display order, with optional labels that replace filenames;
  - verbatim Recall lines;
  - the POV group;
  - the story.

  `curate()` (`src/lib/judge/curate.ts`, pure) checks each entry against the library. Recordings must be ready, with media and poster on disk. A Recall line must be found verbatim, unflagged, in an approved recording. A POV group needs at least two members, all approved and playable. A story's clips must all come from approved, playable recordings.

  Anything that fails is reported and left out. Nothing falls back to the newest item, because test runs (`demo:check`) create stories constantly. Without the file, judge surfaces show honest empty states. `npm run judge:ready` prints the checklist from a read-only DB connection.
- **Honest sync copy.** POV status is "confirmed" only if every non-reference member was confirmed. The tip names the real method (`sync_source`: shared audio, clocks or by hand), so a hand-aligned pair is never described as audio-synced.
- **Exact destinations.** A stop counts as reached only on its intended page and query: the Recall `q`, the night id (its Relive included), the POV group, or the Studio `story`. Off the stop, the dock says so and offers "Return to demo". The dock is hidden over full-screen Relive and comes back when it closes.
- **Guided tour** state lives in `sessionStorage` (`useSyncExternalStore`, server snapshot `null`), so it survives navigation but not a new visit. A dock in the root layout shows the step, a tip describing controls that exist on that page, Back/Next, a link home to the showcase, minimise and end. While the dock is open, `#main` gets extra bottom padding so content can scroll clear of it.
- No backend, worker, OBS, ingestion or AI changes.

## Consequences
- The tour depends on route paths (`onStep`). Renaming a feature route means updating `tourSteps`.
- Approved IDs are specific to this library. Another machine needs its own `judge-demo.json`.
- Relive and Recall are the real app: they can show unapproved recordings from the same night or search. Only the showcase, the home spotlight and the tour targets are restricted.
- `next dev` on this machine full-reloads in a loop while the worker writes SQLite (Turbopack sees WAL churn); use the production build for demos and screenshots.
