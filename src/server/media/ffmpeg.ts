import { spawn } from "node:child_process";
import { config } from "../config";

// FFmpeg invocations. Inputs and outputs are absolute paths inside managed
// storage; arguments are passed as an array (no shell), so nothing in a
// filename can be interpreted as a command or an option.

const BASE = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y"];

/** One JPEG frame at `atSeconds`, scaled to at most 1280 px wide. */
export function posterArgs(input: string, output: string, atSeconds: number): string[] {
  return [...BASE, "-ss", atSeconds.toFixed(3), "-i", input, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", output];
}

/** Browser-safe H.264/AAC MP4 proxy, at most 1080p, with progress on stdout. */
export function proxyArgs(input: string, output: string): string[] {
  return [
    ...BASE,
    "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-vf", "scale=-2:'min(1080,ih)'",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    "-progress", "pipe:1", "-nostats",
    output,
  ];
}

export function runFfmpeg(
  args: string[],
  opts: { signal?: AbortSignal; onProgressMs?: (ms: number) => void; timeoutMs?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"], signal: opts.signal });
    let stderr = "";
    const timer = opts.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs) : null;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      const m = /out_time_us=(\d+)/.exec(chunk);
      if (m && opts.onProgressMs) opts.onProgressMs(Number(m[1]) / 1000);
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject((err as NodeJS.ErrnoException).code === "ENOENT" ? new Error("ffmpeg not found — install FFmpeg (brew install ffmpeg)") : err);
    });
    child.on("close", (code, sig) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg ${sig ? `was stopped (${sig})` : `exited with code ${code}`}${stderr ? `: ${stderr.trim().split("\n").pop()}` : ""}`));
    });
  });
}
