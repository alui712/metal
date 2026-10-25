# Devpost submission: ready to paste

Every claim below was checked against the code, the ADRs in `docs/decisions/` and the library on the demo laptop (2026-10-24). Lines marked *(not built)* are future work; keep that wording.

---

## Project title
**METAL**

## Tagline (pick one)
- Every moment has a story.
- The game ends. The moment doesn't.
- Your gaming memories, searchable, replayable and local.

## Short summary (≈200 characters)
METAL is a local-first gaming memory app. It records through OBS, finds clip-worthy moments, makes voice chat searchable, rebuilds your gaming nights, syncs a teammate's POV, and cuts it all into a montage.

---

## Inspiration
Every gamer has a folder of recordings they'll never open again. The best moments of a night are buried in hours of footage. A friend's angle of the same play sits on their computer, and the one funny thing someone said is impossible to find. Clipping tools usually mean uploading everything to someone else's cloud. We wanted the opposite: a tool that runs on your own machine and turns a pile of video files into memories you can search, relive and share.

## What it does
METAL runs as a local web app (a Next.js server plus a background worker on localhost) and works on your real recordings:

- **Capture.** Connects to OBS through obs-websocket. Start and stop recording, run the replay buffer, and save the last 30 s. Saved recordings import into the library automatically. You can also import files or watch a folder.
- **Smart Clip.** Measures each recording with FFmpeg (audio loudness, sudden loudness jumps, picture changes) and suggests clips around what it finds, with evidence such as "Loudness rose 16.8 LU within a second". You preview, adjust the start and end, and save; the clip is cut from the original file. It does **not** recognize kills or game events, and it says so.
- **Local transcription and Recall.** Transcribes speech on your computer with whisper.cpp. Recall then searches what was said, by exact words or approximate meaning (keyword search plus local MiniLM embeddings). Every result plays from the real second the line was spoken. Recall searches speech and recording names only; it cannot see what happened on screen.
- **Time Machine.** Groups recordings into gaming sessions by when they were actually recorded; a new session starts after a break you choose. It lays the session's moments out on a timeline. **Relive** plays a night's moments back to back, crossfading between recordings.
- **Multi-POV.** Pairs your recording with a teammate's recording of the same match (imported with their permission). METAL suggests pairs from overlapping recording times and shared audio. You confirm the sync, nudge it by frames or seconds, or line it up by hand, then watch one POV at a time or side by side on a shared timeline.
- **Story Studio.** Arrange, trim and caption clips from Smart Clip, Recall, Time Machine or Multi-POV. Export renders a real MP4 locally with FFmpeg. Captions are burned into the picture and also included as a subtitle track.
- **Guided demo.** A Memory Portal landing page and a guided tour that walks through Recall, Time Machine, Multi-POV and Story Studio on approved recordings, in a read-only judge mode.

## How we built it
- **App:** Next.js 16 (App Router, Cache Components) with React 19 and Tailwind CSS v4, plus Motion for animation (honoring reduced-motion).
- **Data:** SQLite through better-sqlite3 and Drizzle ORM, with auto-applied migrations. An FTS5 table, kept in sync by triggers, powers keyword search. All data, media and exports stay in a local `data/` folder.
- **Worker:** a separate Node process runs long jobs from a SQLite job queue: import and transcode, analysis, transcription, POV matching, clip cutting and story export. It also owns the single OBS connection.
- **Media:** FFmpeg and ffprobe, always called with argument arrays and never through a shell. Browsers get an H.264 copy when they can't play the original, kept on the same timeline.
- **Speech:** whisper.cpp (`ggml-base.en`) with Silero voice detection. Transcript lines are snapped to FFmpeg-measured sound, and a line you mark as wrong is removed from search.
- **Search:** hybrid retrieval combining FTS5 keyword and phrase matches with local `all-MiniLM-L6-v2` embeddings through transformers.js, with remote model loading disabled.
- **Multi-POV sync:** spectral-flux onset envelopes compared by FFT cross-correlation, with documented thresholds (`SYNC_RULES`). Candidates only come from overlapping recording clocks, the same game, or reliable audio, and only the user can pair them.
- **Captions:** this FFmpeg build has no drawtext or libass, so captions are rendered as PNGs with sharp and overlaid. The layout code is shared with the in-app preview, so the export matches what you saw.
- **Decisions:** 20 architecture decision records (`docs/decisions/`) cover the stack, grounded AI, ingestion, capture, search, sync and the judge experience.

## Technical architecture
```
Browser UI (Next.js App Router, React 19)
   │  server components read SQLite · API routes queue work
   ▼
Next.js server (localhost) ──── SQLite (Drizzle, FTS5, jobs table) ──── data/media, data/exports
   ▲                                       ▲
   │ obs-websocket state/commands          │ claims jobs, heartbeats
   │                                       │
OBS ◄─────────────────────────── Worker process
                                  ├─ ingest / transcode   (FFmpeg, ffprobe)
                                  ├─ analyze              (loudness, scene change, keyframes → Smart Clip rules)
                                  ├─ transcribe           (whisper.cpp + VAD → transcript, chunks, embeddings)
                                  ├─ pov-match            (spectral flux + FFT cross-correlation)
                                  ├─ clip-export          (exact range cut from the original)
                                  └─ story-export         (one FFmpeg pass, ffprobe-verified A/V length)
```
No cloud services, accounts or API keys are needed. AI outputs go through provider adapters and are recorded with their inputs. The UI shows an honest "unavailable" state rather than inventing content.

## Challenges we ran into
- **Honesty versus "AI magic".** Loud doesn't mean funny and a scene change doesn't mean a kill. We kept every Smart Clip suggestion tied to measured evidence and wrote copy that never overclaims. We also tested a visual-search feature (CLIP and SigLIP) and stopped it: it couldn't reliably reject similar-looking scenes that weren't actually there, so we didn't ship it.
- **Aligning two POVs.** Game audio differs between players: different mixes, different voice chat, different lengths. Spectral-flux cross-correlation works when clips share enough sound. Short clips (under 8 s of overlap) or very different audio can't be aligned automatically, so METAL marks those suggestions as unconfirmed and gives frame-accurate manual nudges. The pair in our demo was lined up by hand and confirmed.
- **Exact exports.** Mixing recordings with different codecs, frame rates and missing audio tracks in one FFmpeg pass, while making each clip exactly as long as planned, took normalization, forced A/V lengths and a final ffprobe check before an export counts as done.
- **Captions without drawtext.** Our FFmpeg build has no text rendering, so we render captions as images and keep the preview and export layout identical.
- **Running two processes against one SQLite file.** That needed WAL mode, `IMMEDIATE` transactions where the worker can race the UI, and a heartbeat so the UI can say "the worker isn't running" instead of spinning.

## Accomplishments that we're proud of
- The whole pipeline (capture → analysis → transcription → search → sessions → POV sync → MP4 export) runs on one laptop with no network.
- Every result points at real stored data: a recording, a timestamp, a measured signal or a transcript line.
- A read-only judge mode that scopes the demo to approved recordings on the server, not just in the UI. An optional lock blocks edits to them.
- Recall finds a spoken line by meaning, not just by keyword, and plays it at the exact second.

## What we learned
- "Local-first" is a product decision as much as a technical one: privacy, speed and no upload wait.
- Being clear about what the AI can't do builds more trust than a flashy guess.
- Small, testable pure functions (Smart Clip rules, Relive reducer, POV time mapping, EDL edits) made a fast-moving hackathon codebase safe to change.

## What's next
*(not built yet)*
- A desktop app (Electron) with a tray recorder and global hotkeys.
- Optional on-screen understanding through a vision provider, only if it passes our accuracy bar.
- Speaker labels in transcripts.
- Natural-language editing in Story Studio. The UI slot exists; it is marked "coming later" and does nothing yet.
- Sharing a POV pairing between friends without uploading full recordings.
- "Wrapped"-style recaps of a season of play.

## Built with
`next.js` · `react` · `typescript` · `tailwind-css` · `sqlite` · `better-sqlite3` · `drizzle-orm` · `ffmpeg` · `obs-websocket` · `whisper.cpp` · `transformers.js` · `all-minilm-l6-v2` · `sharp` · `motion` · `zod` · `vitest` · `node.js`

## Working today vs not yet
| Working | Not built / limits |
|---|---|
| OBS record, replay buffer, Save last 30 s, auto-import | Desktop app / global hotkeys (Electron deferred) |
| File import, watched folders | Cloud sync, accounts, sharing links |
| Smart Clip from loudness and picture-change signals | Kill, game-event or laughter recognition |
| Local transcription, Recall by words and meaning | Visual or on-screen search (tested, stopped) |
| Time Machine sessions, Relive | Speaker identification |
| Multi-POV pairing, audio-suggested or manual sync, side by side | Automatic sync when the shared audio is too short or too different |
| Story Studio edit and MP4 export with captions | Natural-language editing (disabled placeholder) |

## Media for the gallery
See `04-submission-checklist.md` → Screenshots.
