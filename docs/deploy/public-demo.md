# Public online demo

> **Status: prepared, not deployed.** No sample footage is cleared for public distribution yet. The data builder refuses to run until a clearance list names every recording it would publish.

A separate, read-only copy of METAL for people who can't run it locally. It's built from a few approved sample recordings that are already indexed. It never connects to the computer METAL normally runs on.

## What runs online

| Works | How |
|---|---|
| Showcase and guided tour | Same pages as the local app |
| Recall: exact words, meaning, game and genre, hand-checked tags | Precomputed transcripts and embeddings; MiniLM runs on each search |
| Visual Recall (experimental) | Precomputed frame embeddings; CLIP's text encoder runs on each search |
| Video playback, Time Machine, Relive, Multi-POV, the approved story export | Files served from the image with HTTP range requests |

| Not online | What visitors see |
|---|---|
| Capture (OBS), import, watched folders, capture settings | `/`, `/import`, `/sources` and `/settings` explain that these run on your own computer |
| Any edit, analysis, transcription, indexing or export | Every `POST`/`PUT`/`PATCH`/`DELETE` is refused with 403 before it reaches a route (`src/proxy.ts`). The UI shows the server's message. |
| Worker, FFmpeg, Whisper | Not installed. Nothing is processed online. |

Read-only mode is on only when `METAL_PUBLIC_DEMO=1`. The guard is pure and tested (`src/server/public-demo.ts`). The demo's guided-tour lock (`judge-demo.json`, `"lock": true`) also stays on.

## Data: approved recordings only

`scripts/public-demo/build-data.mjs` copies the database with SQLite's backup API (it only reads the source), then:

- keeps only the recordings listed in `judge-demo.json`, their story, POV group and export;
- refuses unless each of those recordings is on the clearance list (`cleared.json`: `{"recordings": ["rec_…"], "clearedBy": "…", "date": "…"}`) — footage, voices and on-screen player names must be cleared for public use;
- deletes jobs, worker heartbeats, OBS state, watched folders and settings;
- clears every `source_path`;
- runs `VACUUM`, so deleted rows don't linger in free pages.

It refuses to finish if any recording outside the list, any row pointing at one, any absolute local path (`/Users/`, `/private/`, `/tmp/`), or a failed integrity or foreign-key check remains. It copies only the kept recordings' media and frames, the approved export, and `docs/demo/recall-tags.json`.

## Deploy on Railway

The image holds the code, about 140 MB of demo data and about 170 MB of models. Footage goes only into the deploy folder, never into Git.

```bash
# 1. Stage: committed code + demo data (outside the repo)
scripts/public-demo/stage.sh ~/Projects/metal/data ../metal-demo-deploy path/to/cleared.json

# 2. Deploy from the staged folder (Railway CLI: npm i -g @railway/cli)
cd ../metal-demo-deploy
railway login
railway init                       # new project, e.g. "metal-demo"
railway up --detach                # builds the Dockerfile
railway domain                     # public https://….up.railway.app URL
```

In the Railway dashboard, set a **usage limit** (Workspace → Usage) so a traffic spike can't run up a bill. Optionally turn on **Serverless** (the app sleeps when idle and wakes on the next request, with a cold start of a few seconds).

To update: stage again from a new commit and run `railway up` again. To take it down: delete the Railway project.

## Cost estimate

Railway Hobby is $5/month and includes $5 of usage. Usage is billed at RAM $10/GB-month, vCPU $20/vCPU-month and egress $0.05/GB.

| Scenario | Rough monthly usage | You pay |
|---|---|---|
| Always on, ~0.5 GB RAM, near-idle CPU, light traffic | ≈ $5–7 | ≈ $5–7 |
| Serverless (sleeps when idle), recruiter traffic | ≈ $1–3 | $5 (the plan minimum) |
| Heavy video traffic (every 1 TB served) | + $50 egress | covered by your usage limit |

Alternatives considered:

- **Fly.io:** similar price, more setup.
- **Render:** the free tier sleeps, and 512 MB RAM is tight for the models.
- **Hugging Face Spaces:** a free CPU tier, but the Space's files are public, which would publish the footage there too.
- **Vercel:** serverless functions don't suit SQLite, native modules or large model files.
