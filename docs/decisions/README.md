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
| [0015](0015-real-recall.md) | Real Recall: FTS5 + local MiniLM embeddings over transcripts, Silero VAD, flaggable lines | Accepted |
| [0016](0016-real-time-machine.md) | Real Time Machine: evidence-backed recording times, lockable automatic sessions, Relive player, Studio handoff | Accepted |
| [0017](0017-real-story-studio.md) | Real Story Studio: persistent stories, one-pass normalized FFmpeg export in the worker, verified before success | Accepted |
| [0018](0018-burned-in-captions.md) | Burned-in captions: sharp SVG → PNG overlays timed per clip, shared preview/export layout, subtitle track kept | Accepted |
| [0019](0019-multi-pov-sync.md) | Multi-POV Sync: evidence-only discovery (clocks, game, shared-audio spectral flux), offset groups with suggested vs confirmed sync, one shared playback clock | Accepted |
| [0020](0020-judge-experience.md) | Judge Experience: immersive `/showcase`, sessionStorage guided tour across real content, read-only spotlight with honest fallbacks | Accepted |
| [0021](0021-split-screen-export.md) | Multi-POV split-screen: side-by-side clips keep both recordings and a frozen aligned in-point; hstack/vstack in the one-pass export; no mid-clip filter reinit | Accepted |
| [0022](0022-visual-recall.md) | Visual Recall: opt-in local CLIP frame index (2 s + hard cuts, exact pts), approximate confidence-tiered scene matches merged into Recall behind a per-search Scenes toggle | Accepted |
