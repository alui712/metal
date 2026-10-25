# METAL — release checklist and localhost:3001 cutover plan (v2)

- **v1:** pre-flight audit `812205f`.
- **v2 (2026-10-25):** adds the approved conditions — corrected process identity, real judge content, Visual Recall indexing, lock — and the results of a full rehearsal on a disposable copy of production.
- **Release:** branch `release/judge-final`, the commit that contains this file.
- **Not yet executed against production:** stopping 3001, the migration, content creation, the lock.

## 1. Features in the release
Covered:
- judge UI, Memory Dive 2.0 and the guided demo;
- speech Recall;
- experimental CLIP Visual Recall (off by default, labelled approximate);
- Time Machine;
- Multi-POV navigation, `/povs` and synced playback;
- Story Studio management;
- genuine split-screen MP4 export.

Not included: Qwen.

## 2. Migrations
- **Production is at `0010_multi_pov`** (11 rows, newest 1792865219164).
- **Release adds** `0011_split_clips` (1792910133391) and `0012_visual_index` (1792913353825, `IF NOT EXISTS`). Both are additive, and the timestamps strictly increase.
- **Rehearsed twice** on `.backup` snapshots: 11 → 13, 95/95 clips and 38/38 stories intact, integrity ok, reopening applies nothing.
- **The old build** (`4b9dc23`) opens a restored backup unchanged.

## 3. Production process identity (re-verify right before stopping)
Found 2026-10-25 04:1x. PIDs are **examples only**; §5.1 re-derives them.

```
646   Terminal.app
 └ 4021 login ─ 4023 -zsh (ttys003)
    └ 4050 claude            ← a Claude Code session: it launched the app. NOT the app; never signal it.
       └ 4378 npm exec next dev --port 3001
          └ 4400 node …/metal/node_modules/.bin/next dev --port 3001   ← stop target (SIGINT)
             └ 4403 next-server (v16.4.3)   ← the *:3001 listener; exe /usr/local/bin/node, cwd ~/Projects/metal
                ├ 4444 turbopack pool worker
                └ 4445 turbopack pool worker
```

There is no production worker. v1 said the app was "PID 4050"; that was wrong. 4050 is the session that owns it.

## 4. Status of blockers and decisions

| Item | Status |
|---|---|
| `models` symlink could be committed | ✅ Fixed (`63a79b5`: `/models`) and verified with `git check-ignore`. |
| No production worker / dev server | Fixed by the cutover (§5.4). |
| Approved story has no export / no split-screen story | ✅ Rehearsed: `judge-content.mjs` makes it through the UI (§5.6). |
| Medal end card in the split export | ⚠️ **Found in rehearsal.** "peak pov 2" fades into a "@dhalddiy · CLIPPED WITH MEDAL" end card at 5.62 s of its own time, so the clip is trimmed to end at 5.50 s. A source recording is never modified; the full recording still shows the card at its end in the Multi-POV viewer. |
| Visual index empty in production | ✅ Rehearsed: six approved recordings, 117 frames, 19 s total; memory stayed ≥ 72% free. |
| Lock | ✅ Rehearsed. 11 approved-content writes return 423; reads, playback and unapproved edits/exports work. |
| Lock side effect | ⚠️ With the lock on, *changing the session gap* (`PATCH /api/sessions`, regroups every night) returns 423 for everyone, by design (it would change the approved night). |
| Binding | 127.0.0.1 initially (user decision). |

## 5. Cutover (run only after explicit approval)

Use a normal Terminal window you keep open (not a Claude session). Abort on any unexpected output.

### 5.0 Pre-checks
```bash
cd ~/Projects/metal
memory_pressure | tail -1; df -h ~ | tail -1                    # healthy; ≥ 5 GB free
ps -eo pcpu,etime,command | grep -E "metal-video|ffmpeg|hyperframes" | grep -v grep   # no active render
# Claude Video (session metal-video-2b) has said "clear" / was told to hold.
```

### 5.1 Stop only the 3001 app (identity re-derived, never from old PIDs)
```bash
L=$(lsof -nP -iTCP:3001 -sTCP:LISTEN -t); echo "listener $L"
P=$(ps -o ppid= -p $L | tr -d ' ')
ps -o pid=,command= -p $L,$P                                        # expect: next-server / …/metal/node_modules/.bin/next dev --port 3001
lsof -a -p $L -d cwd -Fn | tail -1                                  # expect: n/Users/alexlui/Projects/metal
ps -o command= -p $P | grep -q "Projects/metal/node_modules/.bin/next dev --port 3001" && kill -INT $P
sleep 3; lsof -nP -iTCP:3001 -sTCP:LISTEN || echo "3001 free"
ps -o pid=,command= -p $L,$P 2>/dev/null || echo "app processes gone"
```
- Never `pkill`, `killall`, or signal the `claude` process.
- If the session that owns it (ttys003) is reachable, Ctrl-C there instead.

### 5.2 Final backup (app stopped)
A verified pre-cutover backup already exists: `~/metal-backups/20261025-0421-precutover` (read-only, restore-tested). Take a final one after the stop:
```bash
cd ~/Projects/metal; STAMP=$(date +%Y%m%d-%H%M)-cutover; B=~/metal-backups/$STAMP; mkdir -p $B
sqlite3 data/metal.db ".backup '$B/metal.db'"
sqlite3 $B/metal.db "pragma integrity_check; select count(*) from __drizzle_migrations; pragma wal_checkpoint(TRUNCATE);"   # ok | 11
sqlite3 $B/metal.db ".schema" > $B/schema-0010.sql
sqlite3 -json $B/metal.db "select * from __drizzle_migrations order by created_at" > $B/migrations-0010.json
for t in recordings story_projects story_clips exports pov_groups pov_members chunks transcript_segments sessions; do echo "$t $(sqlite3 $B/metal.db "select count(*) from $t")"; done > $B/counts.txt
cp -p data/judge-demo.json data/obs-connection.json data/metal.pre-*.db $B/
rsync -a data/media data/exports $B/
(cd data && find media exports -type f -exec shasum {} +) | sort -k2 > $B/manifest.txt
(cd $B && find media exports -type f -exec shasum {} +) | sort -k2 | diff - $B/manifest.txt && echo "media verified"
git rev-parse HEAD > $B/commit.txt; rm -f $B/metal.db-wal $B/metal.db-shm; chmod -R a-w $B
diff $B/counts.txt ~/metal-backups/20261025-0421-precutover/counts.txt && echo "no changes since pre-cutover backup"
```

### 5.3 Code
```bash
cd ~/Projects/metal
git switch release/judge-final            # untracked .claude/ and skills-lock.json are unaffected
git diff --quiet 4b9dc23 HEAD -- package-lock.json && echo "deps unchanged"
npm run typecheck && npm run lint && npm test && npm run build
```

### 5.4 Worker, migration, server
```bash
# Terminal A
cd ~/Projects/metal && npm run worker                 # "online (pid …, 9 handlers)"; applies 0011 + 0012
# Terminal B
cd ~/Projects/metal
sqlite3 "file:data/metal.db?mode=ro" "select count(*), max(created_at) from __drizzle_migrations; pragma integrity_check;"   # 13 | 1792913353825 | ok
for t in recordings story_projects story_clips exports pov_groups pov_members chunks transcript_segments sessions; do echo "$t $(sqlite3 "file:data/metal.db?mode=ro" "select count(*) from $t")"; done | diff - $B/counts.txt && echo "counts unchanged"
npx next start -H 127.0.0.1 -p 3001
```

### 5.5 Smoke tests (read-only)
```bash
U=http://127.0.0.1:3001
curl -s $U/api/health | python3 -m json.tool | grep -E '"(id|state|detail)"'      # worker Online
npm run -s judge:ready                                                            # 10/10 (story has no export yet)
for p in / /showcase /library /clips /recall /sessions /povs /studio /sources /settings /import /status /recall/demo /sessions/demo "/studio?demo=1" /povs/pov_f0d531b728c341d7 /sessions/ses_8d11f9a1c0cb4a02; do printf "%-40s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$U$p")"; done
curl -s "$U/api/recall?q=Did+that+bug+just+die%3F" | head -c 160; echo
curl -s -o /dev/null -w "media %{http_code}\n" -r 0-1023 $U/api/media/rec_cda5ff4e0e324829/video   # 206
```

### 5.6 Judge content (in this order; the lock must come last)
1. **Index the six approved recordings for Visual Recall.** This must happen before the lock, which refuses indexing on approved recordings.
   ```bash
   for id in rec_cda5ff4e0e324829 rec_6520f3fcd3324fb8 rec_2a9084d48d7f4a4d rec_8447152d28794042 rec_8d11f9a1c0cb4a02 rec_1297a2d0b54b411e; do curl -s -X POST -H "x-metal-action: 1" $U/api/recordings/$id/visual; echo; done
   sleep 60; sqlite3 "file:data/metal.db?mode=ro" "select recording_id, status, frame_count from recording_visual_index"   # 6 × done
   curl -s "$U/api/recall?q=climbing+a+green+jungle+mountain&visual=1" | head -c 200; echo   # PEAK frames
   ```
2. **Approved split-screen story and export, through the UI.** Check that port 9333 is free first. The script trims Out to 8.007 s (before the end card) and sets the caption "Same moment. Two perspectives." and the title "PEAK — two POVs, side by side".
   ```bash
   METAL_URL=$U node scripts/demo-check/cdp.mjs scripts/release/judge-content.mjs   # 5 PASS + RESULT {storyId, export.id}
   ```
3. **Inspect the MP4.**
   - `ffprobe` shows 1920×1080 h264/aac/mov_text, 5.50 s.
   - Tile it (`ffmpeg -i data/exports/<exp>.mp4 -vf fps=2,scale=480:-1,tile=2x6 -frames:v 1 /tmp/sheet.jpg`) and confirm both halves show gameplay with **no end card**.
4. **Approve it.** Set `"story": "<storyId>"`, `"exports": ["<exportId>"]` in `data/judge-demo.json` (the previous file is in `$B`). Then `npm run -s judge:ready` should show **11/11**.
5. **Lock.** Set `"lock": true`, then:
   ```bash
   METAL_URL=$U STORY=<storyId> EXPORT=<exportId> node scripts/demo-check/cdp.mjs scripts/release/release-check.mjs   # all PASS (read-only)
   curl -s -o /dev/null -w "%{http_code}\n" -X PATCH -H "x-metal-action: 1" -H "Content-Type: application/json" -d '{"title":"x"}' $U/api/stories/<storyId>   # 423
   ```
6. **Take a post-content backup** (§5.2 with a new `STAMP`).

## 6. Rollback

**Triggers:** a migration error; integrity not `ok`; counts differ; health not ok; any smoke route not 200; `judge:ready` below target; the guided demo broken.

```bash
# Stop the new stack: Ctrl-C in Terminal B (next start) and Terminal A (worker); confirm 3001 is free.
cd ~/Projects/metal; F=data.failed-$(date +%H%M); mkdir $F
mv data/metal.db data/metal.db-wal data/metal.db-shm $F/ 2>/dev/null; cp data/judge-demo.json $F/
cp $B/metal.db data/metal.db && chmod u+w data/metal.db && cp $B/judge-demo.json data/judge-demo.json && chmod u+w data/judge-demo.json
sqlite3 data/metal.db "pragma integrity_check; select count(*) from __drizzle_migrations;"     # ok | 11
(cd data && find media exports -type f -exec shasum {} +) | sort -k2 | diff - $B/manifest.txt  # only new exports/visual frames expected; never rsync --delete
git switch feat/judge-experience          # 4b9dc23
npx next dev --port 3001                  # exactly as before (no worker)
```
- Restoring discards anything created after the cutover: the approved story/export rows and visual index rows.
- Their files stay in `data/exports` and `data/media/<rec>/visual*`, and are harmless to the old build.

## 7. Known limitations (state honestly)
- **Visual Recall is experimental and approximate (CLIP).**
  - Rehearsal hits: "climbing a green jungle mountain" → PEAK; "first-person shooter on a sunny sandstone street" → the shooter clips.
  - Misses and errors: "yellow wallpaper backrooms hallway" → nothing; "neon pink corridor" → the other shooter clip.
  - **Fog is mistaken for water:** "a player swimming underwater" → PEAK's foggy slopes.
  - Results say "Looks similar · approximate" or "Low confidence", never verified. Scenes is off by default. Actions (kills, jumps) are not recognised.
- **Speech Recall** is the reliable path.
- **The approved split-screen clip shows climbing across mossy cliffs from two players**; it makes no claim of a jump.
- **The full "peak pov 2" recording** ends with a Medal end card that METAL does not edit out of sources.
- **Judge mode is a presentation scope, not authentication;** the lock is an on-machine switch.
- **The worker runs through `tsx`.**
