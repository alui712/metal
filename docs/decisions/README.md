# Architecture Decision Records

Short records of decisions that shape METAL. Add a new numbered file when a decision is made or reversed; don't rewrite history — supersede it.

| # | Decision | Status |
|---|---|---|
| [0001](0001-local-first-stack.md) | Local-first stack: Next.js 16 + SQLite (better-sqlite3 + Drizzle) + local media storage | Accepted |
| [0002](0002-worker-process-and-job-queue.md) | Separate worker process with a SQLite-backed job queue | Accepted |
| [0003](0003-grounded-ai-and-provenance.md) | Hybrid AI stack; every AI result grounded in real recordings with provenance | Accepted |
| [0004](0004-proxy-media-and-ffmpeg.md) | Proxy transcodes for playback; FFmpeg for all media work | Accepted |
| [0005](0005-hybrid-retrieval.md) | Brute-force vector search + FTS5, merged with Reciprocal Rank Fusion | Accepted |
| [0006](0006-cache-components-data-access.md) | Data access under Cache Components: `connection()` + Suspense | Accepted |
| [0007](0007-desktop-app-direction.md) | Desktop-first: Electron wrapper, OBS capture via obs-websocket, local folder connector | Electron deferred by 0009 |
| [0008](0008-demo-fixtures-behind-repository.md) | Demo fixtures behind a repository interface, labeled in the UI | Accepted |
| [0009](0009-web-first-hackathon-mvp.md) | Web-first local app for the hackathon MVP; Electron deferred | Accepted |
| [0010](0010-ingestion-and-managed-storage.md) | Streamed uploads into managed storage; ffprobe/poster/proxy ingest job; range streaming | Accepted |
| [0011](0011-obs-capture-via-worker.md) | OBS capture via obs-websocket, owned by the worker; event-driven, validated auto-import | Accepted |
| [0012](0012-watched-folder-sync.md) | Watched folders: explicit, validated folders; worker scan + fs.watch; import via the upload pipeline with cross-source dedupe | Accepted |
| [0013](0013-ffmpeg-analysis-and-smart-clip.md) | Local FFmpeg analysis (loudness, scene changes, keyframes) and transparent rule-based Smart Clip | Accepted |
| [0014](0014-local-transcription.md) | Local whisper.cpp transcription: DTW timing, silence alignment, anti-hallucination rules, search-ready storage | Accepted |
