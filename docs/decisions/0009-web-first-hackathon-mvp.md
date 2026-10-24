# 0009 — Web-first for the hackathon MVP (Electron deferred)

**Status:** Accepted (Phase 2). Supersedes the Electron parts of [0007](0007-desktop-app-direction.md) for the MVP.

## Context
The submission is a 3-minute 1080p demo of Capture → AI Smart Clip → Recall → Time Machine → Story Studio. An Electron shell adds packaging, native-module, and security work that the demo doesn't need: the local Next.js server and worker already run on the user's machine.

## Decision
- METAL ships as a **local web app**: Next.js server + background worker on `localhost`, opened in a browser. No Electron for the MVP; desktop packaging stays a future option and ADR 0007's security model applies if it returns.
- Everything privileged (FFmpeg, file storage, and later OBS and folder watching) runs in the server or worker, never in the browser.
- OBS integration (obs-websocket) and folder watching move to the worker. Folders are added by path instead of a native picker.
- In-game hotkeys go through OBS's own hotkeys (a browser can't see keys while a game has focus); METAL reacts to OBS's events.

## Consequences
- The local API must defend itself against other websites in the same browser: state-changing routes check that `Origin` matches `Host`, uploads require a custom header (forcing a CORS preflight), and media is served only by recording id from managed storage.
- Roadmap renumbered: 2 ingestion, 3 OBS capture, 4 folder connector, 5 analysis + Smart Clip, 6 real Recall/Time Machine, 7 Studio export, 8 polish & demo.
