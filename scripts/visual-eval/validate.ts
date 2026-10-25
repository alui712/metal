// Visual Recall validation (docs/visual-recall.md): real gaming footage → an isolated
// METAL data dir → visual-index jobs → visual search, scored against scene labels.
// Usage: VISUAL_EVAL_MEDIA=<dir of rec_*/original.* source copies> VISUAL_EVAL_OUT=<scratch dir> npx tsx scripts/visual-eval/validate.ts
// The labels below describe the specific test clips used for the reported numbers;
// the splice clip is built as described in docs/visual-recall.md. Source files are only read.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { openDb } from "../../src/server/db/client";
import * as queue from "../../src/server/jobs/queue";
import { receiveUpload } from "../../src/server/media/upload";
import * as indexer from "../../src/server/visual/indexer";
import * as vs from "../../src/server/visual/search";
import { handlers } from "../../src/worker/handlers";

const SP = process.env.VISUAL_EVAL_OUT!;
const WT = process.cwd();
const MEDIA = process.env.VISUAL_EVAL_MEDIA!; // read-only source footage
if (!SP || !MEDIA) throw new Error("Set VISUAL_EVAL_MEDIA and VISUAL_EVAL_OUT.");
process.env.METAL_DATA_DIR = path.join(SP, "data");
process.env.EMBED_MODEL_DIR = path.join(WT, "models");

const LABEL: Record<string, (t: number) => string> = {
  rec_77c0361d49c14678: () => "lethal", rec_1297a2d0b54b411e: (t) => (t >= 52 ? "lethal" : t < 42 ? "hallway" : "skip"),
  rec_87757b552fed4264: () => "hallway", rec_15303b9d9ec5480a: () => "hallway", rec_3487fb1a796747fd: () => "phas", rec_558b04bdddfb4408: () => "phas",
  rec_8d11f9a1c0cb4a02: () => "backrooms", rec_b62aa9c884a84e47: () => "backrooms", rec_cda5ff4e0e324829: () => "peak", rec_8447152d28794042: (t) => (t >= 6 ? "logo" : "peak"),
  rec_2a9084d48d7f4a4d: () => "valorant", rec_6520f3fcd3324fb8: () => "valorant", rec_a5113821afb84bb5: () => "league", rec_f0bd67b32fdc448e: () => "rivals",
  rec_ff7f7d4fed344998: () => "roblox", rec_86a2c06ecf944d68: () => "roblox", rec_e7b825de2ee84812: () => "roblox", rec_b05cf0a9d8454077: () => "roblox",
  rec_6c652660fb6f42d0: () => "desktop", rec_6caef0437dd74ddf: () => "desktop", rec_8235e769112f4c4c: () => "desktop",
  splice: (t) => (t >= 15 && t < 21 ? "valorant" : "phas"),
};
// [query, wanted classes] — [] = absent from the library ("unrelated" or "similar" gaming scene).
const PRESENT: Array<[string, string[]]> = [
  ["creepy corridor in a deserted clinic at night", ["hallway"]], ["scaling a rock wall covered in moss", ["peak"]],
  ["tactical shooter round with a pistol and an agent ability", ["valorant"]], ["empty office with yellow walls and fluorescent lights", ["backrooms"]],
  ["ghost hunting in a pitch-black house with a torch", ["phas"]], ["a code editor and terminal window on a monitor", ["desktop"]],
  ["a multiplayer online battle arena seen from above", ["league"]], ["players in orange space suits in a gloomy building", ["lethal"]],
  ["a hero shooter in a red-lit futuristic city", ["rivals"]], ["an overgrown jungle cliff seen in first person", ["peak"]],
  ["a gloomy hospital corridor with a wheelchair", ["hallway"]], ["a game made of simple blocky shapes", ["roblox"]],
];
const ABSENT: Array<[string, string]> = [
  ["a cat sleeping on a couch", "unrelated"], ["a card game table with playing cards", "unrelated"], ["a sunny beach with palm trees", "unrelated"],
  ["a birthday party with balloons", "unrelated"], ["a spaceship flying through stars", "unrelated"], ["a medieval knight on horseback", "unrelated"],
  ["a horror game in a dark forest at night", "similar"], ["a giant dragon boss fight", "similar"], ["a battle royale parachute drop over an island", "similar"], ["a football video game on a green pitch", "similar"],
];
const EXAMPLES = ["Find the monster in the hallway", "Find when I was holding a sniper", "Show me the dark room with my teammates", "Find the scene where an enemy appeared"];

async function main() {
  fs.rmSync(process.env.METAL_DATA_DIR!, { recursive: true, force: true });
  const db = openDb(path.join(process.env.METAL_DATA_DIR!, "metal.db"));

  let peakRss = 0;
  const sample = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 100);
  const runJobs = async () => {
    for (;;) {
      const job = queue.claimNextJob(db);
      if (!job) return;
      try {
        await handlers[job.kind]({ db, job, progress: () => {}, signal: new AbortController().signal });
        queue.completeJob(db, job.id);
      } catch (err) {
        console.error("job failed", job.kind, String(err));
        queue.failJob(db, job.id, String(err), { retry: false });
      }
    }
  };

  // Import copies (the app's own upload path) into the isolated library.
  const origin = new Map<string, string>(); // new id → source key
  for (const key of Object.keys(LABEL)) {
    const file = key === "splice" ? path.join(SP, "src/splice-silent.mp4") : path.join(MEDIA, key, fs.readdirSync(path.join(MEDIA, key)).find((f) => f.startsWith("original"))!);
    const { id } = await receiveUpload(db, { body: Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>, filename: path.basename(file) });
    origin.set(id, key);
  }
  await runJobs();
  const ids = [...origin.keys()];
  const rssBefore = process.memoryUsage().rss;
  peakRss = rssBefore;
  const t0 = Date.now();
  for (const id of ids) indexer.requestVisualIndex(db, id);
  await runJobs();
  const wall = Date.now() - t0;
  const views = ids.map((id) => ({ id, ...indexer.visualIndexView(db, id) }));
  const totalDur = ids.reduce((s, id) => s + (db.$client.prepare("select duration_ms d from recordings where id=?").get(id) as { d: number }).d, 0);
  const frames = views.reduce((s, v) => s + (v.frameCount ?? 0), 0);
  const ext = views.reduce((s, v) => s + (v.timing.extractMs ?? 0), 0), emb = views.reduce((s, v) => s + (v.timing.embedMs ?? 0), 0);
  const out: string[] = [];
  out.push(`## Indexing`, `${ids.length} recordings, ${(totalDur / 60000).toFixed(1)} min of video, ${frames} frames (${views.filter((v) => v.status === "done").length} done, ${views.filter((v) => v.status !== "done").length} not done)`);
  out.push(`wall ${(wall / 1000).toFixed(1)} s = ${((wall / totalDur) * 60).toFixed(2)} s per video minute · extract ${(ext / 1000).toFixed(1)} s · embed ${(emb / 1000).toFixed(1)} s (${(emb / frames).toFixed(0)} ms/frame) · RSS ${(rssBefore / 1e6).toFixed(0)} → peak ${(peakRss / 1e6).toFixed(0)} MB`);
  const dbBytes = db.$client.prepare("select sum(length(embedding)) b from visual_frames").get() as { b: number };
  out.push(`embedding storage ${(dbBytes.b / 1024).toFixed(0)} KiB; frame JPEGs ${(ids.reduce((s, id) => s + Number(execDu(path.join(process.env.METAL_DATA_DIR!, "media", id, "visual"))), 0) / 1024).toFixed(1)} MiB`);

  const labelOf = (recId: string, tMs: number) => LABEL[origin.get(recId)!](tMs / 1000);
  const fmtHit = (h: { recordingId: string; startMs: number; endMs: number; visual?: { confidence: string; similarity: number; frames: Array<{ tMs: number }> } }) =>
    `${origin.get(h.recordingId)!.slice(0, 12)}@${(h.startMs / 1000).toFixed(1)}–${(h.endMs / 1000).toFixed(1)}s [${h.visual!.frames.map((f) => labelOf(h.recordingId, f.tMs)).join(",")}] ${h.visual!.confidence} ${h.visual!.similarity}`;

  // Queries
  const qt: number[] = [];
  const search = async (q: string, f = {}) => {
    const t = Date.now();
    const r = await vs.searchVisual(db, q, f);
    qt.push(Date.now() - t);
    return r;
  };
  out.push(``, `## Present scenes (want → returned)`);
  let likelyQ = 0, anyQ = 0, top1 = 0, relFrames = 0, allFrames = 0, wrongMoments = 0, moments = 0;
  for (const [q, want] of PRESENT) {
    const r = await search(q);
    const hits = r.hits;
    if (hits.length) anyQ++;
    if (hits.some((h) => h.visual.confidence === "likely")) likelyQ++;
    if (hits[0] && want.includes(labelOf(hits[0].recordingId, hits[0].visual.frames[0].tMs))) top1++;
    for (const h of hits) {
      moments++;
      const ok = h.visual.frames.filter((f) => want.includes(labelOf(h.recordingId, f.tMs))).length;
      relFrames += ok;
      allFrames += h.visual.frames.length;
      if (!ok) wrongMoments++;
    }
    out.push(`- ${q} → ${want} :: ${hits.length ? hits.slice(0, 4).map(fmtHit).join(" | ") : "NO RESULT"}${hits.length > 4 ? ` (+${hits.length - 4})` : ""}`);
  }
  out.push(``, `present: ${anyQ}/${PRESENT.length} got results (${likelyQ} likely, ${anyQ - likelyQ} low-confidence only); top-1 correct ${top1}/${PRESENT.length}; preview-frame precision ${(relFrames / allFrames).toFixed(2)} (${relFrames}/${allFrames}); moments with no correct frame ${wrongMoments}/${moments}`);
  out.push(``, `## Absent scenes`);
  let likelyFp = 0, lowFp = 0;
  for (const [q, kind] of ABSENT) {
    const r = await search(q);
    const likely = r.hits.filter((h) => h.visual.confidence === "likely");
    if (likely.length) likelyFp++;
    else if (r.hits.length) lowFp++;
    out.push(`- (${kind}) ${q} :: ${r.hits.length ? r.hits.map(fmtHit).join(" | ") : "no result"}`);
  }
  out.push(``, `absent: ${likelyFp}/${ABSENT.length} returned "likely" matches (false positive); ${lowFp}/${ABSENT.length} returned only low-confidence; ${ABSENT.length - likelyFp - lowFp}/${ABSENT.length} no result`);

  // Timestamp accuracy: Valorant inserted at exactly 15.000–21.000 s of a silent Phasmophobia clip.
  out.push(``, `## Timestamp accuracy (splice, truth 15.0–21.0 s, no audio)`);
  const spliceId = [...origin].find(([, k]) => k === "splice")![0];
  for (const q of ["tactical shooter round with a pistol and an agent ability", "a first-person shooter with a gun", "a bright colorful shooter game"]) {
    const r = await search(q, { recordingId: spliceId });
    const h = r.hits[0];
    out.push(`- ${q} :: ${h ? `${fmtHit(h)} seek ${(h.seekMs / 1000).toFixed(1)}s · start err ${((h.startMs - 15000) / 1000).toFixed(1)}s · end err ${((h.endMs - 21000) / 1000).toFixed(1)}s · ${r.hits.length} moment(s)` : "NO RESULT"}`);
  }
  // Within-recording boundary: hallway < 42 s, crew in suits ≥ 52 s.
  const mixed = [...origin].find(([, k]) => k === "rec_1297a2d0b54b411e")![0];
  for (const q of ["players in orange space suits in a gloomy building", "creepy corridor in a deserted clinic at night"]) {
    const r = await search(q, { recordingId: mixed });
    out.push(`- (1297, hallway <42 s / suits ≥52 s) ${q} :: ${r.hits.map(fmtHit).join(" | ") || "NO RESULT"}`);
  }

  out.push(``, `## User example queries (judged by viewing frames)`);
  for (const q of EXAMPLES) {
    const r = await search(q);
    out.push(`- ${q} :: ${r.hits.map((h) => `${fmtHit(h)} frames ${h.visual.frames.map((f) => f.frameId).join(",")}`).join(" | ") || "no result"}`);
  }
  const first = qt[0];
  out.push(``, `query latency: median ${[...qt].sort((a, b) => a - b)[qt.length >> 1]} ms, first ${first} ms (includes text-model load) over ${frames} frames`);
  clearInterval(sample);
  const text = out.join("\n");
  fs.writeFileSync(path.join(SP, "report.md"), text);
  console.log(text);
}

function execDu(p: string): string {
  return execFileSync("du", ["-sk", p]).toString().split("\t")[0];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
