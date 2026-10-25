# Judge questions: short, honest answers

**What makes METAL different from Medal?**
Medal is a cloud clipping and sharing platform. METAL is local-first: your recordings, transcripts and search index never leave your computer. It's also built around *memories* rather than single clips. You can search what was said, replay a whole night in order, sync a friend's POV of the same play, and cut a story from all of it. It's original work, not affiliated with Medal, and uses no Medal assets or APIs.

**Why is local-first important?**
- **Privacy:** voice chat is personal, and your friends didn't agree to have it uploaded.
- **Speed:** no upload queue, so a replay you save is playable seconds later.
- **Cost and control:** gameplay video is huge. Keeping it local means no storage bill, no account and no lock-in.
- **It still works offline:** you could turn off Wi-Fi and the demo would run the same.

**What AI does METAL actually use?**
Three local pieces, and nothing in the cloud:
- **whisper.cpp** (base English model with voice detection) for speech-to-text.
- **MiniLM sentence embeddings** (via transformers.js) so Recall can match by meaning.
- **Signal processing, not AI, for Smart Clip:** FFmpeg loudness and scene-change measurements ranked by transparent rules, with the score breakdown visible. Multi-POV also uses signal processing: audio cross-correlation.

We tried visual search with CLIP and SigLIP. It couldn't tell "similar" from "actually there", so we cut it rather than ship guesses.

**What works today?**
All of it runs on real recordings:
- OBS recording and replay saving, file import and watched folders.
- Smart Clip suggestions with evidence, and exact clip cutting.
- Local transcription, and Recall search by words or meaning.
- Time Machine sessions and Relive.
- Multi-POV pairing with suggested, manual and confirmed sync, in single-POV or side-by-side view.
- Story Studio editing and real MP4 export with captions.

**Not built yet:** the desktop app, recognizing game events or kills, speaker labels, and natural-language editing (the UI is marked "coming later").

**What was the hardest technical challenge?**
Probably exact, honest media handling. Story export has to normalize clips with different codecs, frame rates and missing audio in one FFmpeg pass, force every clip to its planned length, and verify the result with ffprobe before calling it done. Close behind: two-POV audio alignment, and keeping two processes safe on one SQLite file.

**How does Multi-POV alignment work?**
1. **Candidates:** METAL only considers recordings that overlap in recorded time, share the game, or share reliable audio.
2. **Fingerprint:** for each recording it computes a spectral-flux envelope (onsets of sound, in 10 ms steps).
3. **Match:** it cross-correlates the envelopes with an FFT. A peak that is high and distinct enough, with at least 8 s of overlap, becomes a *suggested* offset.
4. **Your call:** you pair the recordings. In the viewer you check them side by side, nudge by a frame, 0.1 s or 1 s, and mark "Sync looks right" to *confirm*.

When the shared audio is too short or too different, there's no automatic match, and you line the recordings up by hand. Our demo pair was aligned that way, and the app labels it "lined up by hand".

**What would you build next?**
- A desktop app with a tray recorder and global hotkeys.
- Speaker labels in transcripts.
- Opt-in POV sharing between friends without uploading full videos.
- Natural-language editing that turns "make it 30 seconds" into reviewable edits.
- On-screen understanding, but only once it passes our accuracy bar.
