# 0016 — Real Time Machine: sessions from evidence-backed recording times

**Status:** Accepted (Phase 6B)

## Context
Time Machine used demo fixtures. Real recordings carried a `recorded_at` that was often the *import* time: `ingest` fell back to `importedAt`, uploads used the browser's `lastModified`, and the recording DTO used `recordedAt ?? importedAt`. Grouping on that would invent sessions ("everything you imported today was one night").

## Decision
- **The source of each recording time is recorded** in `recordings.recorded_at_source`. Values, from most to least trusted:
  - `filename`: recorder timestamp patterns (OBS `YYYY-MM-DD HH-MM-SS`, ISO, `YYYYMMDD_HHMMSS`), in local time. "Replay …" names mark the save, so the duration is subtracted.
  - `metadata`: the container's `creation_time`.
  - `capture`: the OBS save event.
  - `parent`: a Smart Clip's parent time + offset.
  - `manual`.
  - `file-date`: a file's mtime. Labeled approximate ("may be when it was copied").
- **Import time is never a recording time.** The fallbacks were removed. Migration `0008` clears upload times that match the import to within 2 s and backfills sources. File-name times are backfilled on sync.
- **Unknown times stay unknown.** Those recordings sit in a "Not in a session" tray. Users can add them to a session themselves, and the session still says "Recording times unknown": no clock, no day-based title.
- **Automatic sessions** (`src/server/timemachine/sessions.ts`):
  - `clusterRecordings` is a pure, chronological pass. A new session starts after a gap longer than the setting, or when a known game changes.
  - The gap is configurable: 15 min to 4 h, default 45, stored in `app_settings`.
  - `syncSessions` is idempotent, keeps session ids stable, and only writes on change. It runs in an IMMEDIATE transaction, because a deferred read→write transaction can't upgrade while the worker writes under WAL.
  - Smart Clip outputs (`origin = clip`) are never members, which avoids duplicate moments.
- **Manual edits win.** Rename, move (to a session, a new session, or out), split and merge each set `sessions.locked` / `recordings.session_locked`, so automatic regrouping leaves them alone. "Return to automatic grouping" clears the locks.
- **Titles are factual:** the user's name, or "{game ·} Friday night" from the start time (before 5 am counts as the previous night). No AI summaries are produced, so none are shown.
- **Moments are the session's open Smart Clip suggestions,** with their measured evidence, keyframe, transcript excerpt (labeled machine transcript) and uncertainty note. They are ordered by wall-clock time. Favorites are `clip_suggestions.favorite_at`.
- **Relive** is a pure state machine (`src/lib/timemachine/relive.ts`) reflected onto one `<video>`. It swaps the source and seeks to each moment's exact range, with curtain fades (instant under reduced motion). It supports pause, resume, previous, next and jump; exits with Esc; and skips unplayable videos, counting them. Nothing is rendered.
- **Studio handoff:** `POST /api/stories` writes `story_projects` / `story_clips` with real recording ids, `suggestion_id`, and the moments' own in/out, ordered chronologically. `/studio?story=` loads it into the existing EDL editor through a `SourceLookup` instead of the demo repository. The preview plays the original videos in sync with the edit clock. Export says "MP4 export arrives in Phase 7".
- The demo is kept at `/sessions/demo`. Demo ids (`ses_sector7`, …) still resolve to the fixture pages.

## Consequences
- Folder files that only have an mtime cluster approximately and are labeled that way. A copied folder can collapse onto its copy time; users can split it or correct it.
- Studio stories from Time Machine are stored server-side, but edits made in the Studio aren't persisted yet (Phase 7).
