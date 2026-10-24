# 0011 — OBS capture: one obs-websocket connection owned by the worker

**Status:** Accepted (Phase 3)

## Decision
- **OBS does the recording.** METAL controls OBS Studio (28+) through its built-in obs-websocket v5 server; METAL has no recording engine of its own.
- **The worker owns the connection** (`src/server/capture/service.ts`). The Next server can't hold a long-lived socket reliably across HMR and route reloads. The worker connects from saved settings, authenticates (v5 SHA-256 challenge), reconnects with backoff, stops retrying after an authentication failure until the settings change, and mirrors OBS's real state (recording + duration, replay buffer, replay length, OBS version) into the single-row `capture_state` table about every 500 ms.
- **UI → OBS commands** go through `capture_commands`. `POST /api/capture/command` enqueues one and waits for the worker's outcome. Commands expire after 10 s instead of running late. The route returns 503 when the worker is offline, 409 when not connected, and 504 on timeout. *Save Clip succeeds only after OBS emits `ReplayBufferSaved`*, never on request acceptance alone.
- **Imports are event-driven.** `ReplayBufferSaved` and `RecordStateChanged` (stopped, with `outputPath`) queue an `obs-import` job, whether the save came from METAL or from OBS's own hotkey. The job checks the path:
  - it is absolute, has an allowed extension, and is a regular file (not a symlink);
  - its realpath is inside OBS's `GetRecordDirectory`;
  - OBS is on loopback.

  The job then waits until size and mtime are stable and the file opens, and streams it through the Phase 2 `receiveUpload` (sniffing, SHA-256 dedupe, `ingest`). `recordings.origin` records `obs-replay` / `obs-recording`. OBS's own files are never modified or deleted.
- **Credentials:** host, port, and password are saved in `data/obs-connection.json` (mode 0600, atomic write). They're kept out of the DB, so DB copies don't carry the password. Only the worker reads the password. APIs return `hasPassword`, and the password field is write-only. Only loopback hosts are accepted. All capture writes require same-origin plus the `x-metal-action` header.
- **Replay length:** METAL sets `RecRBTime` (`SimpleOutput` or `AdvOut`, depending on the output mode) only when *it* starts the buffer and the buffer is stopped, because OBS reads the value at start. While the buffer is running, the UI shows OBS's actual length and explains how to change it.
- **Hotkeys:** browsers can't receive global key presses while a game has focus, so in-game clipping uses OBS's own *Save Replay* hotkey. METAL detects those saves through the same event.

## Consequences
- The worker must be running for capture (the UI says "Worker offline" otherwise).
- A remote OBS (another computer) is not supported. Its files would not be on this disk.
- Quality, format, audio tracks, and hotkeys are still configured in OBS.
