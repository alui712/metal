# METAL — 3-minute demo

Phase 8C audit of the demo journey, run against this machine's library on 2026-10-24. Run `npm run demo:check` before rehearsing; see [Repeat the check](#repeat-the-check).

## Readiness

| Step | Status | Footage it runs on |
|---|---|---|
| Capture (`/`) | ✅ OBS · Connected, controls live | live OBS |
| Smart Clip | ✅ measured suggestions, a saved clip that is the exact range (14.40 s) | **real gameplay** |
| Recall | ✅ exact and paraphrase hits play at the spoken timestamp | ⚠️ **test fixtures**: no real gameplay contains speech |
| Time Machine + Relive | ✅ a real night with 2 moments; Relive plays the real video | **real gameplay** |
| Multi-POV Sync | ✅ the moment is kept exactly (20 000 → 20 000 ms) | ⚠️ **sample fixtures**: there is no second real POV |
| Story Studio + export | ✅ 1920×1080 H.264/AAC, 25.80 s vs 25.8 s planned, rendered in ~4.5 s | **real gameplay** |

These checks found no app blockers, so no app code changed in this phase.

## Footage in the library

**Genuine gameplay.** These are OBS captures of Roblox Studio playtests, analyzed in this phase:

| Recording | Length | Use |
|---|---|---|
| `rec_e7b825de2ee84812` · 2026-10-24 12-47-11 | 47 s | **Smart Clip hero**: 2 suggestions (0:19 sudden, 0:42 loud) |
| `rec_ff7f7d4fed344998` · 2026-10-24 02-42-27 | 31 s | **Time Machine night** `ses_ff7f7d4fed344998` (moment 0:07) |
| `rec_86a2c06ecf944d68` · 2026-10-24 02-52-27 | 45 s | same night (moment 0:43) |
| `rec_b05cf0a9d8454077` · 2026-10-24 14-22-12 | 20 s | spare (moment 0:01) |
| `rec_1f05f73243094226` | 14.4 s | Smart Clip saved from 12-47-11, 0:32.6–0:47 |

**Real OBS captures that are not gameplay.** These show a desktop or code editor: `2026-10-24 00-53-20`, `Replay 2026-10-24 00-54-16` and `2026-10-24 01-34-25`. Their speech transcripts are short and noisy, so don't demo them.

**Test fixtures.** Generated test patterns and synthetic or scripted audio; never present them as gameplay:
- Smart Clip tests: `Smart Clip test - multiple events / quiet / voice chat / match end` and the clip cut from them. The voice-chat and match-end recordings carry the scripted voice lines Recall finds.
- Multi-POV samples: `2026-10-20 … POV sample A / POV sample B / Unrelated sample C`. A and B are paired, and B is labelled "Sample player B".
- Earlier import, folder and OBS tests: `Ranked Night - Overtime`, `Replay 2026-10-22 21-04-11`, `Night 1 - clutch`, `live-writing`, `added-while-offline`, `Medal Clip ace`, `broken` (a deliberately failed import).
- Demo-only pages: `/recall/demo`, `/sessions/demo` and `/studio?demo=1` are labelled fixtures.

## Recommended demo (3:00)

Before you start:
- Run `npm run build && npm start -- --port 3001` and `npm run worker`, or the existing dev server plus worker.
- Open OBS, and set the browser window to 1920×1080.
- Run `npm run demo:check` once; it should show 20 PASS.

1. **0:00 Capture**: open `/`. Point at "OBS · Connected", the replay buffer, and "Save last 30 s". *"METAL drives OBS locally; nothing leaves this machine."*
2. **0:20 Smart Clip**: open `/recordings/rec_e7b825de2ee84812`.
   - Show the signal timeline and the two suggestions, then **Preview** the 0:42 one.
   - Point out the evidence lines (the 0:19 one reads "Loudness rose 16.8 LU within a second"). *"Measured, not guessed: METAL never claims a kill or a laugh."*
   - **Save clip**. It already exists, so it opens instantly; **Open clip** plays the exact 14.4 s cut.
3. **0:50 Recall**: open `/recall` and type **the match was really close**.
   - The top hit is "Good game everyone, that was a really close match." at 0:30. Click it and it plays from that line. Mention the meaning match, which needs no keyword overlap.
   - Then **two enemies on the stairs** gives the exact phrase.
   - Say plainly that these are scripted test recordings, because tonight's gameplay had no voice chat.
4. **1:20 Time Machine**: open `/sessions/ses_ff7f7d4fed344998`, the 2:42–2:53 AM night.
   - Show the session lane and the two measured moments. Click **Select all**, then **Relive 2 selected**, and let it play about 15 s.
5. **1:50 Multi-POV**: open `/povs/pov_2b8395d040cc42c4?rec=rec_557a1fbf174d4bbc` and say they're **sample** recordings.
   - Press → a few times, then press **2**: the same moment, from the other angle.
   - Press **V** for side by side. Show the "Sync confirmed" chip and the ±frame nudges.
   - From the recording page, explain that "Find other POVs" found it through shared audio at +12.25 s.
6. **2:20 Story Studio**: back on the night, press **Send 2 to Story Studio**. Show the clips, trim and the 16:9 framing.
   - Press **Export**, then **Render MP4**. It takes about 5 s; then press play.
   - Close with *"Every moment has a story."*

## Footage still needed for a fully real demo

- [ ] **Gameplay with voice chat**, so Recall searches real speech (needs a mic track in OBS). Any 1–5 min clip with clear callouts works. Transcribe it with **Transcribe speech** on its page.
- [ ] **Two POVs of one match**: a friend's recording of the same session, imported with their permission. Both need the shared voice chat or loud game audio for an audio match, or they can be paired by hand and nudged.
- [ ] **Clean game capture**: use OBS *Game Capture* or *Window Capture* of the game client, not *Display Capture*. The real Roblox Studio captures show editor panels, and at least one moment (02-42-27 around 0:07) shows a desktop browser with chat text. Check every frame you'll show live, or re-record.
- [ ] Optionally, a few recordings across 2–3 nights, so the Time Machine list feels lived-in.

After importing new footage, run **Find moments**, **Transcribe speech** and (for POVs) **Find other POVs** on each, then rerun the check with your IDs (see below).

## Known blockers and fallbacks

| Risk | Fallback |
|---|---|
| No real speech in the gameplay | Recall on the labelled scripted recordings, or `/recall/demo` (labelled demo) |
| No second real POV | The labelled sample A/B pair; or pair two real recordings by hand. Only do this if they really are the same match, and the sync stays "Suggested" until you confirm it. |
| Personal screen content in the real captures | Show only the checked moments listed above, or re-record with Game Capture |
| OBS not running or disconnected | Capture shows an honest disconnected state. Skip to Smart Clip; everything else works without OBS. |
| Worker not running | Exports and analysis wait ("Waiting for the worker"). Start `npm run worker`. `/status` shows the heartbeat, and earlier exports of the same night already exist in Story Studio. |
| A live render fails | Open an earlier finished story from the Studio list: its MP4 plays in the app |
| Dev-server first-load compile pauses | Use the production build, or click through every demo page once beforehand |

## Repeat the check

```bash
npm run demo:check   # needs the app on :3001, the worker, and Google Chrome
```

- **What it does:** it drives headless, muted Chrome at 1920×1080 through the whole journey. It verifies media with ffprobe and saves screenshots to `data/demo-check/shots/`.
- **What it leaves behind:** each run reuses the saved Smart Clip, but adds one story and one export.
- **Pointing it at other footage:** `DEMO_RECORDING`, `DEMO_SESSION`, `DEMO_POV_A`, `DEMO_POV_B`, `DEMO_QUERY`, `DEMO_PARAPHRASE`, `METAL_URL`, `METAL_DATA_DIR`, `CHROME_PATH`.
