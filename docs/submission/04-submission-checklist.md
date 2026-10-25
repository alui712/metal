# Final submission checklist

Legend: ✅ checked on 2026-10-24 23:02 EDT (read-only) · ⚠️ needs action · ❓ unverified, owner must confirm.

> **❓ Official event rules were not verified.** No event name, Devpost URL, deadline or rules page appears anywhere in the repo, and nothing was fetched. Paste the hackathon's Devpost link and re-check every "Devpost" row against the official rules page: deadline and time zone, video length limit, required fields, eligibility, and judging criteria (including Best UI/UX).

## Devpost required fields (typical, confirm against the rules)
- [ ] Project name, tagline and the "About" story: paste from `01-devpost-submission.md`.
- [ ] "Built with" tags.
- [ ] Demo video URL (see below).
- [ ] Image gallery: at least 3 screenshots, 3:2 recommended.
- [ ] "Try it out" links: the repository (a hosted app isn't possible; METAL is local-only, so say so).
- [ ] Team members added to the Devpost project, each of whom accepted the invite.
- [ ] Any prize or track opt-ins (Best UI/UX, etc.) selected.
- [ ] Any extra questions the event asks (❓ check the rules).
- [ ] Submitted (not just saved as a draft) before the deadline. Screenshot the confirmation.

## Demo video
- [ ] Final cut from the video worktree (owned by Video Claude). Length within the event limit (❓; our plan is 3:00).
- [ ] Uploaded to YouTube, Vimeo or another host Devpost accepts, set to **Public or Unlisted**, not Private.
- [ ] Opened in a logged-out/incognito window: it plays, sound works, and it isn't region- or age-restricted.
- [ ] Captions or subtitles if possible (helps UI/UX judging).
- [ ] No Medal branding or assets anywhere in the video.

## Screenshots (1920×1080, production build, judge mode)
Take them from `/showcase` → guided tour so only approved content appears.
- [ ] Memory Portal (`/showcase`)
- [ ] Recall result for "Did that bug just die?", with the line highlighted
- [ ] Time Machine night `ses_8d11f9a1c0cb4a02` (rail + moments)
- [ ] Multi-POV side by side (`V`) with the "Sync confirmed" chip
- [ ] Story Studio editor
- [ ] Optional: Smart Clip on `rec_e7b825de2ee84812` with its evidence lines
- [ ] Check every frame for personal desktop content, chat text or notifications (the earlier OBS captures showed a desktop browser; `docs/demo/README.md`).

## Repository
- ✅ Remote: `https://github.com/alui712/metal.git`.
- [ ] ❓ Visibility: public, or judges invited. Check it from a logged-out browser.
- [ ] Branches merged as you intend (`feat/judge-experience` → main, `feat/feature-ux` reviewed). No agent has pushed or merged anything.
- [ ] ⚠️ `README.md` is still the create-next-app boilerplate. Replace it with a short overview, setup (`npm i`, FFmpeg, whisper-cpp, models, OBS), `npm run dev:all`, and a link to `docs/`.
- [ ] Nothing secret committed: `data/`, `models/`, `.env*` and `obs-connection.json` are gitignored. Run `git ls-files | grep -Ei 'data/|\.env|obs-connection'`; it should print nothing.
- [ ] ⚠️ No `LICENSE` file exists. Choose one, or state "all rights reserved" if that's intended.

## Team details
- [ ] Names, roles, and Devpost/GitHub handles in the submission.
- [ ] ❓ Eligibility (age, location, student status, per the rules).

## Third-party licenses and attribution
List these in the README or in a "Credits" section of the submission:
- [ ] Next.js, React, Tailwind CSS, Drizzle, better-sqlite3, Motion, zod, lucide-react, Radix Dialog, transformers.js (all MIT / Apache-2.0 / ISC; confirm with `npx license-checker --summary`).
- [ ] **FFmpeg** (LGPL/GPL depending on the build; it is called as an external binary, not bundled).
- [ ] **whisper.cpp** (MIT) and the **ggml-base.en** model (OpenAI Whisper weights, MIT); **Silero VAD** (MIT).
- [ ] **all-MiniLM-L6-v2** (Apache-2.0, via Xenova/Hugging Face).
- [ ] **OBS Studio / obs-websocket** (GPL-2.0; driven over its protocol, not bundled).
- [ ] Fonts used in the UI (check `src/app/layout.tsx`).
- [ ] State clearly: "Not affiliated with Medal. No Medal assets or APIs."

## Rights and consent for footage and voices (⚠️ highest risk)
- [ ] ❓ **Approved recordings:** "peak pov", "peak pov 2", "backrooms 2", "Voice chat" (`METAL_Rend_VoiceChat_Combined.mp4`), `dGNmEv3_a-Ube0WFBkkNqA.mp4` and `CTnULlxyHo2bsbmKtRLlGg.mp4`. These were imported as uploads; their origin isn't recorded. Confirm you recorded them or have permission. Random-ID filenames often come from clip-sharing sites, and if any came from Medal, that conflicts with the "no Medal assets" rule.
- [ ] ❓ **Voices** in "Voice chat": written or recorded OK from everyone audible, including use in the public video.
- [ ] ❓ **Second POV** ("peak pov 2"): permission from that player.
- [ ] ❓ **Game content:** the game's capture/streaming policy allows use in a public video (Roblox experiences, etc.).
- [ ] ❓ **Music** in the video: licensed or royalty-free, with credit if required.

## Live demo server
- ✅ Production app answering on `http://localhost:3001` (`/status` 200).
- ✅ Worker heartbeat fresh (5 s old).
- [ ] Before judging, run `npm run judge:ready` in `~/Projects/metal` (read-only DB) and confirm every item passes.
- [ ] Laptop on power, Do Not Disturb on, notifications off, auto-sleep off.
- [ ] Browser: clean profile, no bookmarks bar, zoom 100%, 1920×1080.
- [ ] Wi-Fi not needed; consider turning it off to prove local-first.
- [ ] OBS open and connected if you're showing Capture.

## Approved demo content (`data/judge-demo.json`)
- ✅ Night `ses_8d11f9a1c0cb4a02`. Six approved recordings, all `ready`. Moments: backrooms 2 ×2, Voice chat ×4.
- ✅ Recall line "Did that bug just die?" exists verbatim and unflagged at 4.64 s in `rec_1297a2d0b54b411e`.
- ✅ POV `pov_f0d531b728c341d7`: peak pov (reference, confirmed) and peak pov 2 (sync source `manual`, confirmed). The tour will say "lined up by hand and confirmed".
- ✅ Story `sty_dc85871415dd4a1a` "peak pov 2 POV": one clip, peak pov 2, 0:00–0:07.98, 16:9, captions on.
- ⚠️ **The approved story has no exports**, and there's no `exports` key in judge-demo.json. So "View exports" in judge mode shows none. Optional: outside judge mode, render it once, then add that export id under `"exports"`. Don't do this during judging.
- ⚠️ `public/showcase/intro.mp4` is absent in the main checkout, so the intro uses the poster fallback. Fine, unless Video Claude supplies the montage (then `npm run build` again).

## Judge lock and data protection
- ⚠️ `"lock": true` is **not set** in judge-demo.json. Decide whether to enable it. It makes write routes return 423 for approved content. It's an on-machine switch, not authentication.
- [ ] Remember: judge mode is a presentation scope. Removing `?judge=1`, or using the sidebar, opens the full library. Keep the cleanup plan (`06-cleanup-plan.md`) in mind if judges explore.
- [ ] Don't run `npm run demo:check` after the final backup: each run adds a story and an export.

## Final backup and rollback
Do this with the app and worker **stopped** (or at least idle), so SQLite is consistent:
```bash
cd ~/Projects/metal
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p ~/metal-backups/$STAMP
sqlite3 data/metal.db ".backup '$HOME/metal-backups/$STAMP/metal.db'"   # consistent copy, includes WAL
cp data/judge-demo.json data/obs-connection.json ~/metal-backups/$STAMP/
rsync -a data/media data/exports ~/metal-backups/$STAMP/                  # ≈740 MB today
git -C ~/Projects/metal rev-parse HEAD > ~/metal-backups/$STAMP/commit.txt
```
**Rollback:**
1. Stop the app and worker.
2. Move the current `data/` aside (`mv data data.broken-$STAMP`).
3. Restore: `mkdir data && cp ~/metal-backups/$STAMP/metal.db data/ && rsync -a ~/metal-backups/$STAMP/{media,exports} data/ && cp ~/metal-backups/$STAMP/*.json data/`.
4. Check out the commit in `commit.txt`.
5. `npm run build`, start, then `npm run judge:ready`.

- [ ] Keep a second copy of the final video file and the screenshots offline (USB drive).
