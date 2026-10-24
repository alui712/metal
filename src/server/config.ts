import path from "node:path";

// Server-side configuration. Shared by the Next.js server and the worker
// process, so it must not import "server-only" (see ADR 0002).

function resolveFromRoot(p: string): string {
  // Runtime data location, not a bundled asset: exclude from output tracing.
  return path.isAbsolute(p) ? p : path.join(/*turbopackIgnore: true*/ process.cwd(), p);
}

export const config = {
  dataDir: resolveFromRoot(process.env.METAL_DATA_DIR ?? "data"),
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  whisperPath: process.env.WHISPER_PATH ?? "whisper-cli",
  get whisperModelPath(): string {
    return resolveFromRoot(
      process.env.WHISPER_MODEL_PATH ?? "data/models/ggml-base.en.bin",
    );
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
