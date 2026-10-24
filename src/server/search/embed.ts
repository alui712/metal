import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

// Local sentence embeddings (all-MiniLM-L6-v2, quantized ONNX) via
// transformers.js. Offline only: remote model downloads are disabled, so a
// missing model is reported as unavailable — search falls back to keywords.

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: true }) => Promise<{ data: Float32Array; dims: number[] }>;

export const EMBED_DIMS = 384;
let loading: Promise<Extractor> | null = null;

export function embedderStatus(): { available: true; model: string } | { available: false; reason: string } {
  const dir = path.join(/*turbopackIgnore: true*/ config.embedModelDir, config.embedModelId);
  const ok = ["config.json", "tokenizer.json", "onnx/model_quantized.onnx"].every((f) => fs.existsSync(/*turbopackIgnore: true*/ path.join(dir, f)));
  return ok ? { available: true, model: config.embedModelId } : { available: false, reason: `Semantic search model not found (${config.embedModelId} in models/).` };
}

async function extractor(): Promise<Extractor> {
  loading ??= (async () => {
    const t = await import("@huggingface/transformers");
    t.env.allowRemoteModels = false;
    t.env.allowLocalModels = true;
    t.env.localModelPath = config.embedModelDir + path.sep;
    return (await t.pipeline("feature-extraction", config.embedModelId, { dtype: "q8" })) as unknown as Extractor;
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** Unit-length vectors, one per text (cosine similarity = dot product). */
export async function embed(texts: string[]): Promise<Float32Array[]> {
  if (!texts.length) return [];
  const run = await extractor();
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += 32) {
    const batch = texts.slice(i, i + 32);
    const { data } = await run(batch, { pooling: "mean", normalize: true });
    for (let j = 0; j < batch.length; j++) out.push(data.slice(j * EMBED_DIMS, (j + 1) * EMBED_DIMS));
  }
  return out;
}

export const toBlob = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);
export const fromBlob = (b: Buffer) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
