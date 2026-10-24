# 0010 — Ingestion: streamed uploads into managed storage

**Status:** Accepted (Phase 2)

## Decision
- **Upload:** `POST /api/recordings` takes one file as the raw request body (no multipart buffering). The server streams it to `data/media/.incoming/`, hashing (SHA-256) and counting bytes as it goes. It rejects non-video bytes from the first 12 bytes (ISO-BMFF / EBML magic must match the extension) and enforces the 20 GB limit mid-stream.
- **Dedupe:** `recordings.content_hash` is unique. A re-upload of identical bytes is discarded and returns the existing recording; a concurrent race resolves through the unique index.
- **Managed storage:** files live at `data/media/<recordingId>/{original.<ext>, poster.jpg, proxy.mp4}`. The DB stores paths relative to `data/media`; `managedPath()` resolves them and refuses anything outside. Client-supplied filenames are display-only (title), never used in paths.
- **Processing** is an `ingest` job in the existing queue: ffprobe → poster frame → H.264/AAC proxy only when the browser can't play the original (HEVC, MKV, 10-bit, PCM audio…) → `ready`. FFmpeg/ffprobe run via `execFile`/`spawn` with argument arrays (no shell). Unreadable files fail with `PermanentJobError` (no retry) and a friendly message; raw tool output stays in the worker log.
- **Playback:** `GET /api/media/:id/(video|poster)` streams by recording id with single-range support (206/416), `nosniff`, and no path exposure.
- **Library:** real recordings come from the DB via `src/server/recordings.ts` (`LibraryRecording` DTO, no paths). Demo fixtures stay in `MemoryRepository` and are shown separately and labeled.

## Consequences
- The worker must be running for imports to finish (`npm run dev:all` or `npm run worker`); the UI says so when it isn't.
- Removing a recording deletes METAL's copy only.
