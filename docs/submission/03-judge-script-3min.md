# 3-minute backup demo

Same setup as the 90-second script. This version adds Capture and Smart Clip from the full app, then follows the guided tour. Everything stays read-only except the optional live render in step 7.

**Real footage to use outside the tour** (from `docs/demo/README.md` and the DB):
- `rec_e7b825de2ee84812` ("2026-10-24 12-47-11", 47 s) has two Smart Clip suggestions and a saved 14.4 s clip.
- Don't show the test fixtures ("Smart Clip test …", "POV sample …", "broken", etc.) or the desktop captures from 00:53 to 01:34.

| Time | Click | Say |
|---|---|---|
| **0:00 Portal** | `/showcase`. Let the intro play. | "The game ends, the moment doesn't. METAL is a local-first memory app for your gameplay: no uploads, no accounts." |
| **0:15 Capture** | **Enter METAL** → home. Point at "OBS · Connected", the replay buffer and **Save last 30 s**. | "METAL drives OBS on this machine. Hit Save Replay in game, and the clip lands in the library with nothing else to do." *(If OBS is closed: "It honestly says it's disconnected; everything else works without it.")* |
| **0:35 Smart Clip** | `/recordings/rec_e7b825de2ee84812`. Point at the tool row, the signal timeline and the evidence lines; **Preview** the 0:42 suggestion. | "Smart Clip measures loudness and picture changes with FFmpeg, and shows its evidence: this one is a 16.8 LU jump in a second. It doesn't pretend to know it's a kill. You preview, adjust the start and end, and save; the clip is cut from the original." |
| **1:00 Recall** | `/showcase` → **Start guided demo**. Click the "Did that bug just die?" result. | "Whisper transcribes speech locally, and Recall searches it by exact words or by meaning. The result plays from the exact second. It searches speech, not visuals." |
| **1:25 Time Machine** | Dock **Next**. Show the time rail and the moment cards, then **Relive this night** for about 10 s. | "Sessions are built from when recordings were actually made; this night's times are approximate, from file dates, and METAL labels that. Relive plays the night back with crossfades between recordings." |
| **1:55 Multi-POV** | Dock **Next**. Press Space, **2**, **V**, then **1**. Point at the "Sync confirmed" chip and the method line. | "Two players, one match, one shared timeline. METAL finds candidates from overlapping clocks and cross-correlates the audio. The shorter clip is only 8 seconds, right at the minimum shared audio METAL needs for a reliable match, so we lined them up by hand with frame nudges and confirmed them. METAL says exactly that." |
| **2:25 Story Studio** | Dock **Next**. Point at the steps strip, the timeline, the trim sliders and **View exports**. | "Arrange, trim, caption, preview, export. Export is a single FFmpeg pass that forces each clip to its exact length and checks the result with ffprobe before calling it done. In judge mode it's a preview, so nothing changes." |
| *(optional, 2:40)* | Only if the content lock is off and you have rehearsed it: `/studio`, open a non-approved real story, **Export → Render MP4**. It takes about 5 s. | "That's a real 1080p MP4, rendered right here." |
| **2:50 Close** | Back to `/showcase`. | "Capture, Smart Clip, Recall, Time Machine, Multi-POV and Story Studio, all on one laptop. Every moment has a story." |

**Honesty lines to keep in:**
- Smart Clip uses signals, not game understanding.
- Recall searches speech.
- The POV pair was hand-aligned.
- Natural-language editing in Studio is marked "coming later" and is not working.
