// Visual signals without a vision model: FFmpeg scene-change detection and
// timestamped keyframes. A scene change means "the picture changed a lot",
// nothing more.

export type SceneChange = { tMs: number; score: number };

/** Parses `scdet` log lines ("lavfi.scd.score: 21.3, lavfi.scd.time: 4.0"), shifted to source time. */
export function parseScdet(stderr: string, offsetMs = 0): SceneChange[] {
  const out: SceneChange[] = [];
  for (const m of stderr.matchAll(/lavfi\.scd\.score:\s*([\d.]+),\s*lavfi\.scd\.time:\s*([\d.]+)/g)) {
    const score = Number(m[1]);
    const t = Number(m[2]);
    if (Number.isFinite(score) && Number.isFinite(t)) out.push({ tMs: Math.max(0, Math.round(t * 1000) - offsetMs), score });
  }
  return out;
}

export const MAX_KEYFRAMES = 40;
const MAX_SCENE_KEYFRAMES = 16;

/** Pure: evenly spaced samples plus the strongest scene changes, deduped and capped. */
export function keyframeTimes(durationMs: number, scenes: SceneChange[], cap = MAX_KEYFRAMES): Array<{ tMs: number; scene: SceneChange | null }> {
  if (durationMs <= 0) return [];
  const interval = Math.min(60_000, Math.max(5000, Math.round(durationMs / 24)));
  const picks: Array<{ tMs: number; scene: SceneChange | null }> = [];
  const lastFrame = Math.max(0, durationMs - 200);
  for (let t = Math.min(1000, lastFrame); t <= lastFrame; t += interval) picks.push({ tMs: t, scene: null });
  const strongest = [...scenes].sort((a, b) => b.score - a.score).slice(0, MAX_SCENE_KEYFRAMES);
  for (const sc of strongest) {
    // Just after the cut, so the frame shows the new scene.
    const t = Math.min(lastFrame, sc.tMs + 100);
    const near = picks.findIndex((p) => Math.abs(p.tMs - t) < 1500);
    if (near >= 0 && !picks[near].scene) picks[near] = { tMs: t, scene: sc };
    else if (near < 0) picks.push({ tMs: t, scene: sc });
  }
  picks.sort((a, b) => a.tMs - b.tMs);
  if (picks.length <= cap) return picks;
  // Keep every scene frame, thin the uniform ones.
  const scenesKept = picks.filter((p) => p.scene);
  const uniform = picks.filter((p) => !p.scene);
  const room = Math.max(0, cap - scenesKept.length);
  const stride = uniform.length / Math.max(1, room);
  const thinned = Array.from({ length: room }, (_, i) => uniform[Math.floor(i * stride)]);
  return [...scenesKept, ...thinned].sort((a, b) => a.tMs - b.tMs);
}
