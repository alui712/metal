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

- **Judge mode** (Cycle 1B). Tour links carry `?judge=1`. With that flag the server limits the response to the approved list (`src/lib/judge/scope.ts`, `judgeScope()`):
  - **Night page and Relive:** approved, playable recordings and their moments, with counts recomputed, an approved poster as the cover, and no "move to" sessions.
  - **`/api/recall`:** only the prepared line's approved recording. Any other `recording`, a missing one, or `game`/`from`/`to` is refused with 400, never applied.
  - **`/api/stories/:id`:** only the approved story; recordings, moments and candidates are approved only, and the source session appears only if it's the approved night.
  - **POV page:** only the approved pair, opened on one of its members.

  A judge-mode URL for anything else shows "isn't part of the prepared demo", with no substitute. Without the flag every route is the normal app.

  Readiness also requires the night to have at least one approved, playable moment (otherwise Relive isn't offered), and the story's clips to pass the exporter's `checkSources()` (file present, range inside the video).
- **Exact stops:** a stop also needs `judge=1`, the prepared `recording`, no `game`/`from`/`to` on Recall, and no `t` on POV. Anything else counts as off target, and "Return to demo" restores the exact URL.

- **Judge mode doesn't change anything** (safety pass):
  - **Studio:** an unsaved preview. No autosave, no rendering, no deleting. The export list and its polling show only the approved exports (`exports` in judge-demo.json; each must be a finished export of the approved story with its file on disk).
  - **Night page:** no rename, favorites, Send to Story Studio or regrouping.
  - **POV page:** watching and switching only (no nudges, confirm, unpair, rename or clip).
  - **Recall:** no Open recording or Start a story.
  - **Links:** a moment relives in scope, and recording thumbnails aren't links. Deliberate exits are labeled "Leave the demo: …".
- **Server lock (opt-in):** `"lock": true` in judge-demo.json makes write routes return 423 when they touch an approved recording, the night, the story, the POV group or an approved export. It also blocks session regrouping. This applies to every caller, whatever the UI does, and the rest of the library stays editable. It's a switch on this computer, not authentication: anyone with the file can turn it off.

- **Showcase intro ("Memory Portal")** (`src/components/judge/showcase-intro.tsx`):
  - **Film:** about 5.5 s of approved footage behind the headline, then the memory cards push in.
  - **Never blocks:** the headline, Start guided demo and Enter METAL are usable throughout. Skip intro (or Escape) ends it, and Replay intro brings it back.
  - **Plays once per tab,** muted, and pauses when less than half of it is on screen or the tab is hidden.
  - **Reduced motion:** never autoplays.
  - **Source:**
    - an approved silent montage at `public/showcase/intro.mp4` (+ `intro.jpg` poster), gitignored and supplied by the video workspace;
    - otherwise the first three approved recordings' posters with a gentle push-in.
    - A failed video falls back to the posters.
  - **Montage asset requirements:**
    - H.264 MP4, 1920×1080 (or 1600×900), 24 or 30 fps, 5–6 s, no audio track, `+faststart`, at most ~4 MB;
    - footage from the approved recordings only;
    - no burned-in text, and no recorder overlays (the source recordings carry one in the lower left: crop or mask it);
    - its last frame dark enough to dissolve;
    - poster: first frame as JPEG, 1920×1080, at most ~250 KB.
    - Files dropped into `public/` after a build need `npm run build` again.
- **Transitions:**
  - Leaving the showcase for the app (`portal` transition type on Enter METAL and Start guided demo) pushes the stage in and dissolves it while the app settles (≈600 ms). The sidebar fades in.
  - A showcase memory card morphs into its recording's player (shared `recordingArtName`).

## Consequences
- The tour depends on route paths (`onStep`). Renaming a feature route means updating `tourSteps`.
- Approved IDs are specific to this library. Another machine needs its own `judge-demo.json`.
- Judge mode is a presentation scope, not access control. Removing `?judge=1`, or opening any normal route (Library, recordings, other nights), shows the whole unrestricted library. The dock treats that as leaving the demo. Nothing here is private.
- `next dev` on this machine full-reloads in a loop while the worker writes SQLite (Turbopack sees WAL churn); use the production build for demos and screenshots.
