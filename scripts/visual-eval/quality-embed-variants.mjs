// Quality pass step 2/3: embeds every eval frame under each crop variant. Usage: SP=<scratch dir> node scripts/visual-eval/quality-embed-variants.mjs
// Embeds every eval frame under several crop variants with the same local CLIP model.
import fs from "node:fs";
const WT = process.cwd();
const { env, AutoProcessor, CLIPVisionModelWithProjection, RawImage } = await import(`${WT}/node_modules/@huggingface/transformers/dist/transformers.node.mjs`);
env.localModelPath = `${WT}/models/`;
env.allowRemoteModels = false;
const SP = process.env.SP;
const M = "Xenova/clip-vit-base-patch16";
const processor = await AutoProcessor.from_pretrained(M);
const model = await CLIPVisionModelWithProjection.from_pretrained(M, { dtype: "q8" });
const frames = JSON.parse(fs.readFileSync(`${SP}/q2/frames.json`, "utf8"));
const unit = (d) => { const v = Array.from(d); const n = Math.hypot(...v); return v.map((x) => +(x / n).toFixed(5)); };
const emb = async (img) => unit((await model(await processor(img))).image_embeds.data);
const out = { center: [], pad: [], squash: [], left: [], right: [] };
const ms = { center: 0, pad: 0, squash: 0, left: 0, right: 0 };
for (const f of frames) {
  const img = await RawImage.read(f.file);
  const W = img.width, H = img.height, s = Math.min(W, H);
  const t = (k, p) => p.then((v) => (out[k].push(v), v));
  let t0 = Date.now(); await t("center", emb(img)); ms.center += Date.now() - t0;
  t0 = Date.now(); const S = Math.max(W, H); await t("pad", emb(await img.pad([Math.floor((S - W) / 2), Math.ceil((S - W) / 2), Math.floor((S - H) / 2), Math.ceil((S - H) / 2)]))); ms.pad += Date.now() - t0;
  t0 = Date.now(); await t("squash", emb(await img.resize(224, 224))); ms.squash += Date.now() - t0;
  // Left and right squares (the center square is "center"); for portrait frames these are top/bottom.
  t0 = Date.now(); await t("left", emb(await img.crop(W >= H ? [0, 0, s - 1, s - 1] : [0, 0, s - 1, s - 1]))); ms.left += Date.now() - t0;
  t0 = Date.now(); await t("right", emb(await img.crop(W >= H ? [W - s, 0, W - 1, s - 1] : [0, H - s, s - 1, H - 1]))); ms.right += Date.now() - t0;
}
for (const k in ms) ms[k] = +(ms[k] / frames.length).toFixed(1);
fs.writeFileSync(`${SP}/q2/vecs.json`, JSON.stringify(out));
console.log(frames.length, "frames; ms/frame per variant", ms, "rss MB", (process.memoryUsage().rss / 1e6).toFixed(0));
