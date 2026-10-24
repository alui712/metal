# 0012 — Watched folders: scan + watch in the worker, import through the upload pipeline

**Status:** Accepted (Phase 4)

## Decision
- **Explicit folders only.** Users add folders on Sources, either by pasting a path or with the native macOS chooser. The server runs `osascript choose folder` with a fixed script and gets back a path that only pre-fills the form.
  - `checkFolder()` resolves the real path and refuses:
    - the disk root, account roots, system locations, `~/Library`, and hidden folders;
    - METAL's own data directory, and any folder containing it;
    - overlaps with an existing watched folder;
    - unreadable folders, reported as a macOS privacy permission state.
  - Folders are stored in `watched_folders` by real path. The UI only gets a home-relative display path, and file names, never full paths.
- **Kinds:** `obs`, `medal`, and `generic`. They differ only in labeling. The Medal kind reads a local folder; there is no Medal account or API.
- **Worker `FolderSync`:**
  - Scans each active folder on worker start (which catches files added while METAL was off), every 15 s, and every 2 s while files are settling.
  - `fs.watch` (recursive) triggers an early rescan.
  - Scans skip symlinks, hidden entries, non-video extensions, and anything more than 4 levels deep.
  - `folder_files` records each file by `(folder, relative path)` with its size and mtime, so each file is processed once.
- **Completion:** a file is queued only after size and mtime are unchanged across scans for at least 4 s, and its mtime is at least 4 s old. While OBS reports it is recording into that folder, files modified since the recording started are deferred.
- **Renames, removals, and outages:**
  - A file that disappears while a new path with the same size and mtime appears is treated as a rename, so it keeps its state and is not re-imported.
  - Removed files are marked not present; their recordings stay in the library.
  - An unavailable folder keeps its records unchanged, because a disconnected drive is not a deletion.
- **The `folder-import` job:**
  1. Re-validates containment: a relative path with no `..`, `lstat` shows a regular file, and the realpath is inside the folder's realpath.
  2. Waits until the file is stable, then checks it with ffprobe. Invalid files are marked `invalid` and get no recording.
  3. Imports through the Phase 2 `receiveUpload`: read-only stream, sniffing, SHA-256 dedupe, and the `ingest` job for metadata, poster, and proxy.
- **Dedupe across sources:**
  - Content hash, as in Phase 2.
  - `recordings.source_path`, a server-only real path, links the same local file without copying it again.
  - Folder sync waits for an in-flight Phase 3 `obs-import` of the same file, then links to it. OBS auto-import treats a folder-imported copy as the same clip.
- **Recovery:** interrupted imports (job missing) are re-queued. Jobs that died are marked failed and can be retried. The queue already reclaims stale running jobs.

## Consequences
- The worker must run for folders to sync. Anything added while it's stopped is imported on the next start.
- Files are copied into managed storage, not indexed in place, so playback never depends on the source folder.
- Removing a watched folder deletes only METAL's tracking rows.
