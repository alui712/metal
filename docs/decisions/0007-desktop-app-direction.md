# 0007 — Desktop-first: Electron wrapper, OBS capture, local folder connector

**Status:** Electron shell deferred for the hackathon MVP by [0009](0009-web-first-hackathon-mvp.md). OBS, folder connector, and data-safety rules still apply.

## Context
METAL is a standalone desktop gameplay recording and clipping app, not a companion website. The final submission is a 3-minute 1080p product demo following Capture → AI Smart Clip → Recall → Time Machine → Story Studio. Phase 0/1 built a local Next.js server, a worker process, and the UI.

## Decision
- **Electron wraps the existing app**; no rewrite. The main process starts the Next server and the worker, bound to `127.0.0.1`, and loads the UI in a `BrowserWindow`. Development-mode Electron is acceptable for the demo; packaging is optional.
- **Renderer is untrusted:** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. A typed preload exposes a small allowlist through `contextBridge` (folder picker, hotkey registration, reveal in Finder, app info) with validated arguments. Navigation is restricted; external links open in the system browser; permission requests are denied.
- **Local server is locked down:** a random port, a per-launch token, and `Host`/`Origin` checks (blocks other sites and DNS rebinding).
- **Recording is done by OBS**, controlled through obs-websocket v5 (OBS 28+). METAL never claims a native recording engine; the UI says "Recording via OBS". The OBS client and the folder watcher live in the **worker**, so they also run in plain web dev mode and stay out of the renderer.
- **Local folder connector** (e.g. a Medal clips folder): user-selected directory only; imports only finished files (size/mtime stable, file openable); dedupes by size + partial content hash; indexes files in place and never modifies or deletes them; marks the source unavailable when the folder disappears. No credentials and no cloud API are assumed.
- **Data directory:** `./data` in development, Electron's `userData` in the desktop app, passed through `METAL_DATA_DIR`.
- In a plain browser, desktop-only actions show an honest "Available in the desktop app" state.

## Consequences
- Phase 1 UI and Phase 0 server/worker are reused unchanged; new work is additive (shell, capture service, sources).
- `better-sqlite3` must be rebuilt for Electron's ABI in a packaged build; dev and tests keep using system Node.
- Schema additions (sources, capture settings, content hash/storage mode on recordings) come with a documented migration when implemented.
- OBS setup (WebSocket enabled, password, replay buffer) is a user prerequisite; `/status` reports it.
