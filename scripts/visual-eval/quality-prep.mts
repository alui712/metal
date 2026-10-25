// Quality pass step 1/3: adds new footage to the isolated eval library (validate.ts output) and dumps frames. Usage: SP=<scratch dir> npx tsx scripts/visual-eval/quality-prep.mts
// Adds the new clip to the isolated eval library via the app pipeline, then dumps all frames.
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
const SP = process.env.SP!;
process.env.METAL_DATA_DIR = `${SP}/val/data`;
process.env.EMBED_MODEL_DIR = `${process.cwd()}/models`;
const { openDb } = await import(`${process.cwd()}/src/server/db/client.ts`);
const queue = await import(`${process.cwd()}/src/server/jobs/queue.ts`);
const { receiveUpload } = await import(`${process.cwd()}/src/server/media/upload.ts`);
const { handlers } = await import(`${process.cwd()}/src/worker/handlers.ts`);
const indexer = await import(`${process.cwd()}/src/server/visual/indexer.ts`);
const db = openDb(`${SP}/val/data/metal.db`);
const run = async () => { for (;;) { const job = queue.claimNextJob(db); if (!job) return; try { await handlers[job.kind]({ db, job, progress: () => {}, signal: new AbortController().signal }); queue.completeJob(db, job.id); } catch (e) { console.error(e); queue.failJob(db, job.id, String(e), { retry: false }); } } };
const map = new Map(fs.readFileSync(`${SP}/q2/idmap.txt`, "utf8").trim().split("\n").map((l) => l.split(" ") as [string, string]));
const existing = db.$client.prepare("select id from recordings where original_filename = 'blocky-tiktok.mp4'").get() as { id: string } | undefined;
let newId = existing?.id;
if (!newId) {
  ({ id: newId } = await receiveUpload(db, { body: Readable.toWeb(fs.createReadStream(`${SP}/q2/new/blocky-tiktok.mp4`)) as ReadableStream<Uint8Array>, filename: "blocky-tiktok.mp4" }));
  await run();
  indexer.requestVisualIndex(db, newId!);
  await run();
}
const frames = db.$client.prepare("select id, recording_id r, t_ms t, path from visual_frames order by recording_id, t_ms").all() as Array<{ id: string; r: string; t: number; path: string }>;
const key = (r: string) => (r === newId ? "blocky" : r === "rec_1d4d7b44e3684318" ? "splice" : map.get(r)!);
fs.writeFileSync(`${SP}/q2/frames.json`, JSON.stringify(frames.map((f) => ({ id: f.id, rec: f.r, key: key(f.r), t: f.t, file: path.join(`${SP}/val/data/media`, f.path) }))));
console.log(frames.length, "frames;", indexer.visualIndexView(db, newId!));
