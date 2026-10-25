# 90-second live demo

**Setup:** production app on `http://localhost:3001` with the worker running; Chrome at 1920×1080, sound on, zoom 100%. Open `/showcase` and click through every tour stop once beforehand, so nothing compiles on stage.

**Approved content** (from `data/judge-demo.json`, verified in the DB on 2026-10-24):
- **Recall line:** "Did that bug just die?", at 0:04 in **Voice chat**.
- **Night:** `ses_8d11f9a1c0cb4a02`. Six approved recordings and six measured moments; the times are approximate, from file dates.
- **POV pair:** **peak pov** (reference) and **peak pov 2**, lined up by hand and confirmed.
- **Story:** "peak pov 2 POV", one 8 s clip. It has **no approved export** yet (see checklist).

| Time | Click | Say |
|---|---|---|
| 0:00 | `/showcase`, the Memory Portal. Let the intro run about 3 s. | "Every gamer has hours of recordings they never open again. METAL turns them into memories, and it all runs on this laptop." |
| 0:10 | **Start guided demo**, which goes to Recall with the line pre-filled. | "First, Recall: it searches what was said." |
| 0:15 | Click the top result. | "That's the real voice chat, playing from the exact second the line was said. It's transcribed locally with whisper.cpp, and it can match by meaning as well as exact words. Recall searches speech, not what's on screen." |
| 0:30 | Tour dock **Next**, to Time Machine. | "Time Machine groups recordings into the night you actually played them. These moments come from measured audio and picture changes, not guessed kills." |
| 0:40 | **Relive this night**. Let it play about 8 s, then press Esc or close. | "Relive plays the whole night back, moment to moment." |
| 0:52 | **Next**, to Multi-POV. Press **2**, then **V**. | "Here are two players' recordings of the same match on one timeline. Two switches POV, V shows them side by side. METAL suggests pairs from recording time and shared audio. These clips were too short to align on audio, so we lined them up by hand, frame by frame, and confirmed it." |
| 1:10 | **Next**, to Story Studio. Point at the timeline and the trim controls. | "Story Studio turns any of it into a montage. You arrange, trim and caption, then export a real MP4 rendered locally with FFmpeg. In this demo mode, edits are a preview so the content stays safe." |
| 1:25 | Back to `/showcase`. | "METAL. Every moment has a story." |

**If something fails:**
- If the intro video is missing, the posters animate instead. Carry on.
- If Relive stalls, close it and point at the moment cards.
- If you leave the tour, use **Return to demo** in the dock.
- If the dock is hidden over Relive, that's by design: close Relive and it comes back.
