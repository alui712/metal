# METAL — release checklist and localhost:3001 cutover plan

Pre-flight audit 2026-10-25, read-only. Nothing in this file has been executed against production.
**Release candidate:** `feat/multi-pov-nav` (`5bc8a1d` plus this docs commit).

## 1. Feature audit (release candidate)

| Feature | Commit | In branch |
|---|---|---|
| Judge UI, Memory Dive 2.0, guided demo | `4b9dc23` | ✅ |
| Story Studio management (PR #1) | `be2b9b6` via `bc350f4` | ✅ |
| Feature UX clarity + submission docs | `670f004`, `4c05362` | ✅ |
| Genuine split-screen MP4 export | `a73e4fd` | ✅ |
| Speech Recall + experimental CLIP Visual Recall | `438079f`, `1e47584` | ✅ |
| Multi-POV sidebar + `/povs` | `5bc8a1d` | ✅ |
| Time Machine, Multi-POV sync/viewer | earlier phases | ✅ |
| Qwen 2B/4B | — | ❌ excluded, as intended |

The branch's validation (previous runs) covered:
- 244/244 unit tests, typecheck, lint, build;
- 32 Multi-POV browser checks, with a real split MP4;
- Recall 22/23 (the one failure is the known CLIP limitation, §6);
- integration journey 39/39.

## 2. Migrations

Journal (strictly increasing `when`; Drizzle applies only migrations newer than the newest one recorded):

| # | Tag | when |
|---|---|---|
| 10 | `0010_multi_pov` | 1792865219164 ← **production is here** (11 rows) |
| 11 | `0011_split_clips` | 1792910133391 |
| 12 | `0012_visual_index` | 1792913353825 (`IF NOT EXISTS`; databases that ran the old VR 0011 keep their data) |

**Dry run on a `.backup` snapshot of production (read-only source):**
- 11 → 13 migrations;
- 95/95 story clips and 38/38 stories preserved, every story opens;
- integrity and foreign keys ok; reopening applies nothing;
- `judge:ready` 10/10.

Both migrations are additive: 3 nullable/defaulted columns on `story_clips`, and 2 new tables.

**Backward compatibility:** the old code (`4b9dc23`) still opens an upgraded DB. Its newest journal entry is older than the recorded 0012, so it applies nothing and ignores the extra columns. A restore from backup is still the rollback path.

## 3. Production as found (read-only)

- **App:** `next dev --port 3001` (development mode).
  - PIDs 4378 `npm exec` → 4400 `next dev` → 4403 `next-server`, plus pool workers 4444/4445.
  - cwd `~/Projects/metal`; started 02:19 by another Claude Code session (pid 4050, ttys003).
  - Listens on `*:3001` (all interfaces, reachable on the LAN).
- **Checkout:** `~/Projects/metal` on `feat/judge-experience` `4b9dc23`; untracked `.claude/` and `skills-lock.json`.
- **Worker:** **not running.** `/api/health` reports "Worker offline", so capture, import, analysis, transcription, export and visual indexing don't run on 3001 today.
- **Env:** no `METAL_*` overrides and no `.env.local`.
  - Data `~/Projects/metal/data` (850 MB): `metal.db` (+4 MB WAL not yet checkpointed), `media/` 622 MB, `exports/` 118 MB.
  - Also: `judge-demo.json` (no `lock`, no `exports` list), `obs-connection.json` (0600), `pre-0008/0009/0010` DB copies, `research/`, `demo-check/`.
- **Library:** 40 recordings, 38 stories, 13 exports, 2 POV groups, 52 embedded transcript chunks, 0 visual frames, no queued jobs.
- **Models** (`~/Projects/metal/models`, a real directory): `ggml-base.en.bin`, `ggml-silero-v5.1.2.bin`, `Xenova/{all-MiniLM-L6-v2, clip-vit-base-patch16, siglip-base-patch16-224}`. These are the defaults the release reads; no env needed.
- **Dependencies:** `package.json`, `package-lock.json` and `next.config.ts` are identical between `4b9dc23` and the release. No `npm ci` needed.
- **Resources:** 37 GiB free; memory 71% free. Five preview stacks (3105–3109) are also running and using memory.

## 4. Release blockers and decisions

**Blockers (fixed by the cutover itself):**
1. **No production worker.** The cutover starts one; without it, exports and indexing silently queue.
2. **Development server.** Judges should get `next build` + `next start`: faster, no dev overlay, and it doesn't rewrite `AGENTS.md`.

**Fix before cutover (one line, needs approval):**
3. **`models` symlink not ignored.** `.gitignore` has `/models/`, which matches directories only. In the preview worktrees `models` is a symlink, and `git add -A` would commit it.
   - Fix: change the line to `/models` (matches the file, the symlink and the directory).
   - Production is unaffected (its `models/` is a real directory), and no deployment artifact includes it (`next build` doesn't trace `models/`).

**Content decisions (not code):**
4. **Approved demo story has no export.** `sty_dc85…` has 0 exports in production, and `judge-demo.json` has no `exports` list. In judge mode, Studio can't render (read-only), so judges see no MP4 there.
5. **No split-screen story in production.** The headline export exists only in preview data. To show it in the guided demo, create one from the approved POV pair after cutover (Multi-POV → V → Clip both POVs → Export), then add the story and export ids to `judge-demo.json`.
6. **Visual Recall has no index in production** (0 frames). Scene search returns nothing until recordings are indexed from each recording page.
   - The approved six take a few minutes with CLIP.
   - First check that no heavy Claude Video render is running.
7. **`"lock": true` is unset.** Decide whether approved content should refuse edits (423) during judging.
8. **Binding.** Today `*:3001` is reachable from other devices. The plan binds `127.0.0.1`. If judges use another device, use `-H 0.0.0.0` instead (local network only, no auth).

## 5. Exact cutover plan (run only after approval)

Run in a normal Terminal window you keep open (not a Claude session), so the server outlives any one session.

### 5.0 Pre-checks
```bash
cd ~/Projects/metal
lsof -nP -iTCP:3001 -sTCP:LISTEN            # expect next-server 4403
ps -o pid,command -p 4378,4400,4403         # expect npm exec / next dev --port 3001
lsof -a -p 4400 -d cwd -Fn | tail -1        # expect n/Users/alexlui/Projects/metal
memory_pressure | tail -1; df -h ~ | tail -1   # need ≥ 5 GB free
ps -eo pcpu,command | sort -nr | head -5    # no heavy render (metal-video) in progress
```

### 5.1 Stop only the 3001 app
Prefer Ctrl-C in the session/terminal that owns it (ttys003). Otherwise:
```bash
kill -INT 4400      # next dev; npm exec 4378 and next-server 4403 exit with it
sleep 3; lsof -nP -iTCP:3001 -sTCP:LISTEN || echo "3001 free"
pgrep -fl "Projects/metal/node_modules" || echo "no metal processes left"   # 3105–3109 run from other folders
```
There is no production worker to stop. Never use `pkill next` or `pkill node`: it would hit the preview stacks and Claude Video.

### 5.2 Verified backup (app stopped → consistent)
```bash
cd ~/Projects/metal
STAMP=$(date +%Y%m%d-%H%M); B=~/metal-backups/$STAMP; mkdir -p $B
sqlite3 data/metal.db ".backup '$B/metal.db'"
sqlite3 $B/metal.db "pragma integrity_check; select count(*) from __drizzle_migrations;"        # ok | 11
sqlite3 $B/metal.db ".schema" > $B/schema-0010.sql
sqlite3 -json $B/metal.db "select * from __drizzle_migrations order by created_at" > $B/migrations-0010.json
for t in recordings story_projects story_clips exports pov_groups chunks; do echo "$t $(sqlite3 $B/metal.db "select count(*) from $t")"; done > $B/counts.txt
cat $B/counts.txt                                                                              # 40 / 38 / 95 / 13 / 2 / …
cp -p data/judge-demo.json data/obs-connection.json data/metal.pre-*.db $B/
rsync -a data/media data/exports $B/
(cd data && find media exports -type f -exec shasum {} +) | sort -k2 > $B/manifest.txt
(cd $B && find media exports -type f -exec shasum {} +) | sort -k2 | diff - $B/manifest.txt && echo "media verified"
git rev-parse HEAD > $B/commit.txt; git status --short > $B/git-status.txt
du -sh $B
```

### 5.3 Update the code
```bash
cd ~/Projects/metal
git switch -c release/judge-final <release commit>     # the branch itself is checked out in ~/Projects/metal-multipov
git diff --quiet 4b9dc23 HEAD -- package-lock.json && echo "deps unchanged"   # else: npm ci
npm run typecheck && npm run lint && npm test           # models/ is real here, so nothing is skipped
npm run build
```

### 5.4 Migrate under control, then start
```bash
# Terminal A — worker (applies 0011 + 0012 on first open)
cd ~/Projects/metal && npm run worker
# expect "[worker …] online (pid …, N handlers)"

# Terminal B — verify the migration, then serve
cd ~/Projects/metal
sqlite3 "file:data/metal.db?mode=ro" "select count(*), max(created_at) from __drizzle_migrations; pragma integrity_check;"   # 13 | 1792913353825 | ok
for t in recordings story_projects story_clips exports pov_groups; do echo "$t $(sqlite3 "file:data/metal.db?mode=ro" "select count(*) from $t")"; done | diff - <(head -5 $B/counts.txt) && echo "counts unchanged"
npx next start -H 127.0.0.1 -p 3001
```

### 5.5 Smoke tests on :3001 (read-only)
```bash
U=http://127.0.0.1:3001
curl -s $U/api/health | python3 -m json.tool | grep -E '"(id|state|detail)"'     # storage ok, worker ok (Online)
npm run -s judge:ready                                                           # 10/10 ready
for p in / /showcase /library /clips /recall /sessions /povs /studio /sources /settings /import /status \
         /recall/demo /sessions/demo "/studio?demo=1" /povs/pov_f0d531b728c341d7 /sessions/ses_8d11f9a1c0cb4a02 \
         "/studio?story=sty_dc85871415dd4a1a&judge=1"; do printf "%-48s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "$U$p")"; done   # all 200
curl -s "$U/api/recall?q=Did+that+bug+just+die%3F" | head -c 200; echo            # speech hit in rec_1297…
curl -s -o /dev/null -w "media %{http_code}\n" -r 0-1023 $U/api/media/rec_cda5ff4e0e324829/video   # 206
curl -s -o /dev/null -w "export %{http_code}\n" -I $U/api/exports/$(sqlite3 "file:data/metal.db?mode=ro" "select id from exports where status='succeeded' limit 1")   # 200
```
Then by hand, in Chrome at 1920×1080:
- Showcase → Start guided demo (Memory Dive) → the four tour stops;
- Relive the night;
- `/povs` → open the pair → V;
- Recall with Scenes on shows "approximate" labels (empty until indexed, §4.6);
- phone width via DevTools.

Don't run `npm run demo:check` or `recall-visual.mjs` against production: both write stories, exports or indexes.

### 5.6 Optional content steps (each needs its own approval)
- Index the six approved recordings for Visual Recall (§4.6).
- Create and export the split-screen story, then update `judge-demo.json` (§4.4–4.5).
- Set `"lock": true` (§4.7).
- Take a second backup afterwards (repeat §5.2 with a new `STAMP`).

## 6. Rollback

**Triggers:** a migration error in the worker log; integrity is not `ok`; counts differ; health not ok; `judge:ready` < 10/10; any smoke route not 200; the guided demo broken.

```bash
# 1. Stop the new stack: Ctrl-C in Terminal B (next start) and Terminal A (worker).
lsof -nP -iTCP:3001 -sTCP:LISTEN || echo "3001 free"
# 2. Keep the failed state, then restore the database
cd ~/Projects/metal; F=data.failed-$(date +%H%M); mkdir $F
mv data/metal.db data/metal.db-wal data/metal.db-shm $F/ 2>/dev/null
cp $B/metal.db data/metal.db
sqlite3 data/metal.db "pragma integrity_check; select count(*) from __drizzle_migrations;"     # ok | 11
# 3. Media/exports: only if the manifest differs (new exports or indexes may have been added)
(cd data && find media exports -type f -exec shasum {} +) | sort -k2 | diff - $B/manifest.txt || echo "review the diff; restore single files from $B, never rsync --delete"
# 4. Old code, exactly as it ran before
git switch feat/judge-experience          # 4b9dc23 (see $B/commit.txt)
npx next dev --port 3001                  # the original command; the original had no worker
```
Restoring the DB discards anything created after cutover (new stories, exports, POV edits). Export files stay on disk in `data/exports`; copy any you want to keep before restoring.

## 7. Known limitations to state honestly
- **Visual Recall is experimental and approximate.** CLIP mistakes PEAK's foggy green slopes for "a player swimming underwater". The UI labels visual hits "Looks similar · approximate", never verified, and event words (kills, aces, jumps) get an explicit warning. Speech Recall is the reliable path.
- **Judge mode is a presentation scope, not security.** The sidebar leaves it.
- **The worker runs through `tsx`** (no compiled worker build); fine for a single local machine.
