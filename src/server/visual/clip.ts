import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

// Local CLIP (ViT-B/16, quantized ONNX) via transformers.js: image and text
// embeddings in one shared space. Offline only — remote downloads are
// disabled, so a missing model is reported as unavailable, never faked.
// Shared by the worker (images) and the Next server (query text).

export const CLIP_DIMS = 512;
const FILES = ["config.json", "preprocessor_config.json", "tokenizer.json", "onnx/vision_model_quantized.onnx", "onnx/text_model_quantized.onnx"];

export function visualModelStatus(): { available: true; model: string } | { available: false; reason: string } {
  const dir = path.join(/*turbopackIgnore: true*/ config.embedModelDir, config.visualModelId);
  const ok = FILES.every((f) => fs.existsSync(/*turbopackIgnore: true*/ path.join(dir, f)));
  return ok ? { available: true, model: config.visualModelId } : { available: false, reason: `Visual search model not found (${config.visualModelId} in models/).` };
}

type Tensor = { data: Float32Array };
type T = typeof import("@huggingface/transformers");
let lib: Promise<T> | null = null;
let vision: Promise<{ processor: (img: unknown) => Promise<unknown>; model: (inputs: unknown) => Promise<{ image_embeds: Tensor }>; RawImage: T["RawImage"] }> | null = null;
let text: Promise<{ tokenizer: (t: string[], o: object) => unknown; model: (inputs: unknown) => Promise<{ text_embeds: Tensor }> }> | null = null;

function load(): Promise<T> {
  lib ??= import("@huggingface/transformers").then((t) => {
    t.env.allowRemoteModels = false;
    t.env.allowLocalModels = true;
    t.env.localModelPath = config.embedModelDir + path.sep;
    return t;
  });
  return lib;
}

const reset = <X>(p: Promise<X>, clear: () => void) =>
  p.catch((err) => {
    clear();
    throw err;
  });

function visionModel() {
  vision ??= reset(
    load().then(async (t) => {
      const processor = await t.AutoProcessor.from_pretrained(config.visualModelId);
      const model = await t.CLIPVisionModelWithProjection.from_pretrained(config.visualModelId, { dtype: "q8" });
      return { processor: processor as never, model: model as never, RawImage: t.RawImage };
    }),
    () => (vision = null),
  );
  return vision;
}

function textModel() {
  text ??= reset(
    load().then(async (t) => {
      const tokenizer = await t.AutoTokenizer.from_pretrained(config.visualModelId);
      const model = await t.CLIPTextModelWithProjection.from_pretrained(config.visualModelId, { dtype: "q8" });
      return { tokenizer: tokenizer as never, model: model as never };
    }),
    () => (text = null),
  );
  return text;
}

function unit(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

/** Unit-length image embedding of one JPEG/PNG file (CLIP's own resize + center crop). */
export async function embedImageFile(file: string): Promise<Float32Array> {
  const { processor, model, RawImage } = await visionModel();
  const img = await RawImage.read(file);
  const { image_embeds } = await model(await processor(img));
  return unit(Float32Array.from(image_embeds.data));
}

/** Unit-length text embedding in the same space as the images. */
export async function embedText(query: string): Promise<Float32Array> {
  return (await embedTexts([query]))[0];
}

/** Unit-length text embeddings for several strings in one model call. */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const { tokenizer, model } = await textModel();
  const { text_embeds } = await model(tokenizer(texts, { padding: true, truncation: true }));
  const data = Float32Array.from(text_embeds.data);
  return texts.map((_, i) => unit(data.slice(i * CLIP_DIMS, (i + 1) * CLIP_DIMS)));
}
