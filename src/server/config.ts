import fs from "node:fs";
import path from "node:path";

// Server-side configuration. Shared by the Next.js server and the worker
// process, so it must not import "server-only" (see ADR 0002).

function resolveFromRoot(p: string): string {
  // Runtime data location, not a bundled asset: exclude from output tracing.
  return path.isAbsolute(p) ? p : path.join(/*turbopackIgnore: true*/ process.cwd(), p);
}

export const config = {
  // Getter: read at use, so an override set after import (tests) still applies.
  get dataDir(): string {
    return resolveFromRoot(process.env.METAL_DATA_DIR ?? "data");
  },
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  get whisperPath(): string {
    return process.env.WHISPER_PATH ?? "whisper-cli";
  },
  /** GGML model: WHISPER_MODEL_PATH, else models/ or data/models/ in the repo. */
  get whisperModelPath(): string {
    if (process.env.WHISPER_MODEL_PATH) return resolveFromRoot(process.env.WHISPER_MODEL_PATH);
    const candidates = ["models/ggml-base.en.bin", "data/models/ggml-base.en.bin"].map(resolveFromRoot);
    return candidates.find((p) => fs.existsSync(/*turbopackIgnore: true*/ p)) ?? candidates[0];
  },
  get anthropicApiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY || undefined;
  },
};

export const paths = {
  get db(): string {
    return path.join(config.dataDir, "metal.db");
  },
  get media(): string {
    return path.join(config.dataDir, "media");
  },
  get exports(): string {
    return path.join(config.dataDir, "exports");
  },
  recording(recordingId: string): string {
    return path.join(config.dataDir, "media", recordingId);
  },
};
