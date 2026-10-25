# Release: Recall game search + curated tags

Candidate: `feat/recall-games-tags` on top of production `43f5dc7`. Not yet approved for production.

What changes on the machine:
- **Code:** a new build of `com.metal.web`. The worker is not restarted.
- **Database:** no migration. Data changes in the maintenance step are only these:
  - `recordings.game` on four recordings;
  - the approved night's grouping is pinned (`sessions.locked`, `recordings.session_locked` for its 14 members).
- **New data file:** `data/recall-tags.json`, a byte-for-byte copy of `docs/release/recall-tags.json` (sha256 `7421773e65da9e8097a3e2d89c82a1898cd624406f5a71663f74dc1dac9a829f`).

## Why the night must be pinned

Time Machine starts a new session when the known game changes, and `syncSessions` runs on every Time Machine page view. All four recordings below are in the approved night `ses_8d11f9a1c0cb4a02`, which is automatic (not locked).

Setting their games without a pin regroups it on the next page view. Rehearsed on a copy: 14 recordings became 2 + 6 + 6.

`PUT /api/recordings/:id/game` therefore pins the recording's session first, using Time Machine's existing lock (the same as any grouping edit). The judge lock refuses the call for approved recordings and for recordings in the approved night. So the games can only be set in a maintenance window.

## Confirmed games

Each was checked on frames of the recording itself. The list is in `scripts/release/assign-games.mjs`.

| Recording | Title | Game | Evidence |
|---|---|---|---|
| `rec_6520f3fcd3324fb8` | dGNmEv3 a-Ube0WFBkkNqA | Valorant | A Site, Spike Planted, agent kill feed |
| `rec_2a9084d48d7f4a4d` | CTnULlxyHo2bsbmKtRLlGg | Valorant | VANDAL loadout, Jett in kill feed, A Site |
| `rec_f0bd67b32fdc448e` | 7ds8NbR52 kveYyUgNNTRw | Overwatch 2 | STOP THE PAYLOAD, Cassidy, 250 HP |
| `rec_a5113821afb84bb5` | Gzbu5IIgufBKX4dcEd8gRQ | League of Legends | ARAM: Howling Abyss minimap, "Biggest Snowball Ever!" |

No other recording gets a game.

## Procedure

Run from `~/Projects/metal`, with `U=http://127.0.0.1:3001`.

**1. Backup.** The database, the judge config, and a note that no tag file exists yet. Integrity must be ok.
```bash
STAMP=$(date +%Y%m%d-%H%M); B=~/metal-backups/$STAMP-pre-recall-games; mkdir -p $B
sqlite3 "file:data/metal.db?mode=ro" ".backup $B/metal.db"
cp data/judge-demo.json $B/; cp ~/Library/LaunchAgents/com.metal.{web,worker}.plist $B/; git rev-parse HEAD > $B/commit.txt
ls data/recall-tags.json 2>/dev/null || echo "none" > $B/recall-tags.absent
sqlite3 "file:$B/metal.db?mode=ro" "pragma integrity_check; select count(*) from __drizzle_migrations;"   # ok | 13
chmod -R a-w $B
```

**2. Code.**
```bash
git tag rollback/pre-recall-games 43f5dc7
git merge --ff-only feat/recall-games-tags
npm run typecheck && npm run lint && npm test
launchctl bootout gui/501/com.metal.web
npm run build
launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.metal.web.plist
```
Then confirm all of these:
- port 3001 listens on `127.0.0.1` only;
- the worker pid is unchanged;
- `npm run -s judge:ready` shows 11/11.

**3. Tag file.** It is read on each search, so no restart is needed.
```bash
cp docs/release/recall-tags.json data/recall-tags.json && chmod 644 data/recall-tags.json
shasum -a 256 data/recall-tags.json   # 7421773e…829f
curl -s "$U/api/recall?q=pink+gun+with+ace" | head -c 200   # rec_6520f3fcd3324fb8, seekMs 9000, sources ["tag"]
```

**4. Pre-check, then dry run.** The lock is still on.
```bash
sqlite3 "file:data/metal.db?mode=ro" "select id, title, game, session_id from recordings where id in ('rec_6520f3fcd3324fb8','rec_2a9084d48d7f4a4d','rec_f0bd67b32fdc448e','rec_a5113821afb84bb5'); select count(*), (select locked from sessions where id='ses_8d11f9a1c0cb4a02') from recordings where session_id='ses_8d11f9a1c0cb4a02';"
# Expected: four rows with the titles above, game empty, all in ses_8d11f9a1c0cb4a02; then 14|0
METAL_URL=$U node scripts/release/assign-games.mjs   # 4 × PLAN
```

**5. Maintenance window.** Unlock, assign, relock immediately. The window lasts seconds, and 3001 is bound to 127.0.0.1.
```bash
sed -i '' 's/"lock": true/"lock": false/' data/judge-demo.json && diff $B/judge-demo.json data/judge-demo.json   # only the lock line
METAL_URL=$U node scripts/release/assign-games.mjs --apply                                                  # 4 × SET [200]
sed -i '' 's/"lock": false/"lock": true/' data/judge-demo.json && cmp $B/judge-demo.json data/judge-demo.json && echo relocked
```
If any `SET` fails, relock first, then stop and investigate.

**6. Post-change checks.**
```bash
curl -s -o /dev/null $U/sessions; sqlite3 "file:data/metal.db?mode=ro" "select count(*), (select locked from sessions where id='ses_8d11f9a1c0cb4a02') from recordings where session_id='ses_8d11f9a1c0cb4a02'; select count(*) from sessions; select id, game from recordings where game is not null; pragma integrity_check;"
# 14|1 · same session count as $B · exactly the four games · ok
npm run -s judge:ready                                                                                         # 11/11
for id in rec_6520f3fcd3324fb8 rec_f0bd67b32fdc448e rec_cda5ff4e0e324829; do curl -s -o /dev/null -w "%{http_code} " -X PUT -H "x-metal-action: 1" -H "content-type: application/json" -d '{"game":null}' $U/api/recordings/$id/game; done; echo   # 423 423 423
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH -H "x-metal-action: 1" -H "content-type: application/json" -d '{"action":"reset"}' $U/api/sessions/ses_8d11f9a1c0cb4a02   # 423
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH -H "x-metal-action: 1" -H "content-type: application/json" -d '{"title":"x"}' $U/api/stories/sty_98de56719b314583               # 423
```
Then run the browser suites against `$U`: the release check, Recall normal and judge mode, the game search UI, the curated tag, and Multi-POV/phone.

**7. Post-change backup.** Same as step 1 with a new `STAMP`, plus `cp data/recall-tags.json $B/`.

## Rollback

- **Code:** `launchctl bootout gui/501/com.metal.web && git reset --hard rollback/pre-recall-games && npm run build && launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.metal.web.plist`.
- **Tag file:** `mv data/recall-tags.json data/recall-tags.json.off`. A missing file means no tags.
- **Data:** exact inverse of step 5, valid because the pre-check showed games empty and the night unpinned. Run it with the lock off, then relock as in step 5.
  ```bash
  sqlite3 data/metal.db "update recordings set game = null where id in ('rec_6520f3fcd3324fb8','rec_2a9084d48d7f4a4d','rec_f0bd67b32fdc448e','rec_a5113821afb84bb5'); update sessions set locked = 0 where id = 'ses_8d11f9a1c0cb4a02'; update recordings set session_locked = 0 where session_id = 'ses_8d11f9a1c0cb4a02';"
  ```
  The full restore is `$B/metal.db` with both services stopped.

## Visible effect on the approved night

Grouping, title and the guided demo rows are unchanged.

- **Note text:** the page says "You've edited this session, so automatic grouping leaves it as it is." instead of "Grouped automatically…".
- **Reset button:** outside judge mode it shows "Return to automatic grouping", which the lock refuses (423).
