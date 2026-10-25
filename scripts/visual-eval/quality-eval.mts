// Quality pass step 3/3 (docs/visual-recall.md): crop/smoothing/abstention variants scored with the app's own grouping.
// Usage: SP=<scratch dir with q2/frames.json + q2/vecs.json and val/data> npx tsx scripts/visual-eval/quality-eval.mts [v|old|final]
// Visual Recall quality pass: variants × held-out queries, scored with the app's own grouping.
// Thresholds for every variant are tuned ONLY on the old feasibility TUNE set, then frozen.
import fs from "node:fs";
import Database from "better-sqlite3";
import * as clip from "../../src/server/visual/clip";
import * as vs from "../../src/server/visual/search";
const SP = process.env.SP!;
const WT = process.cwd();
process.env.EMBED_MODEL_DIR = `${WT}/models`;

type F = { id: string; rec: string; key: string; t: number; file: string };
const frames: F[] = JSON.parse(fs.readFileSync(`${SP}/q2/frames.json`, "utf8"));
const V: Record<string, number[][]> = JSON.parse(fs.readFileSync(`${SP}/q2/vecs.json`, "utf8"));

// Sanity: the "center" variant must reproduce the app's stored embeddings.
const db = new Database(`${SP}/val/data/metal.db`, { readonly: true });
const stored = new Map((db.prepare("select id, embedding from visual_frames").all() as Array<{ id: string; embedding: Buffer }>).map((r) => [r.id, new Float32Array(r.embedding.buffer.slice(r.embedding.byteOffset, r.embedding.byteOffset + r.embedding.byteLength))]));
const dotA = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const agree = frames.map((f, i) => dotA(V.center[i], stored.get(f.id)!));
console.log(`sanity: center vs stored cosine min ${Math.min(...agree).toFixed(4)}`);

// ── Ground truth (corrected: 1297 is Lethal Company throughout) ──
const CLASS: Record<string, (t: number) => string> = {
  rec_77c0361d49c14678: () => "lethal", rec_1297a2d0b54b411e: () => "lethal",
  rec_87757b552fed4264: () => "hallway", rec_15303b9d9ec5480a: () => "hallway", rec_3487fb1a796747fd: () => "phas", rec_558b04bdddfb4408: () => "phas",
  rec_8d11f9a1c0cb4a02: () => "backrooms", rec_b62aa9c884a84e47: () => "backrooms", rec_cda5ff4e0e324829: () => "peak", rec_8447152d28794042: (t) => (t >= 6 ? "logo" : "peak"),
  rec_2a9084d48d7f4a4d: () => "valorant", rec_6520f3fcd3324fb8: () => "valorant", rec_a5113821afb84bb5: () => "league", rec_f0bd67b32fdc448e: () => "rivals",
  rec_ff7f7d4fed344998: () => "roblox", rec_86a2c06ecf944d68: () => "roblox", rec_e7b825de2ee84812: () => "roblox", rec_b05cf0a9d8454077: () => "roblox",
  rec_6c652660fb6f42d0: () => "desktop", rec_6caef0437dd74ddf: () => "desktop", rec_8235e769112f4c4c: () => "desktop",
  splice: (t) => (t >= 15 && t < 21 ? "valorant" : "phas"), blocky: () => "blocky",
};
const GAME: Record<string, string> = { lethal: "Lethal Company", phas: "Phasmophobia", valorant: "Valorant", league: "League of Legends", rivals: "Marvel Rivals", roblox: "Roblox", peak: "PEAK", backrooms: "Backrooms" };
const cls = (f: F) => CLASS[f.key](f.t / 1000);
type Truth = { classes?: string[]; at?: Array<[string, number, number]> };
const ok = (f: F, tr: Truth) => (tr.classes?.includes(cls(f)) ?? false) || (tr.at?.some(([k, a, b]) => f.key === k && f.t / 1000 >= a && f.t / 1000 <= b) ?? false);

// ── NEW held-out queries (written before any scoring in this pass) ──
const HELD: Array<[string, Truth, string]> = [
  ["spectating a crewmate in a hazmat suit with an oxygen tank", { classes: ["lethal"] }, "scene"],
  ["a beige hospital hallway lit by ceiling lights", { classes: ["hallway"] }, "scene"],
  ["a night-vision style camera view in a dark house", { classes: ["phas"] }, "scene"],
  ["endless mono-yellow rooms with damp carpet", { classes: ["backrooms"] }, "scene"],
  ["hands with blue gloves gripping a mossy rock", { classes: ["peak"] }, "scene"],
  ["a tactical shooter holding a pink knife skin", { classes: ["valorant"] }, "scene"],
  ["a futuristic shooter with red neon lighting and lasers", { classes: ["rivals"] }, "scene"],
  ["a neon purple arena inside a game editor window", { classes: ["roblox"] }, "scene"],
  ["a cartoon cat face logo on a black background", { classes: ["logo"] }, "scene"],
  ["a webpage and code editor on a computer screen", { classes: ["desktop"] }, "scene"],
  ["a white blocky world under a blue sky, filmed vertically", { classes: ["blocky"] }, "scene"],
  ["a fantasy battlefield with a minimap in the bottom right corner", { classes: ["league"] }, "edge"],
  ["a circular minimap in the top-left corner of a shooter", { classes: ["valorant"] }, "edge"],
  ["an inventory grid of items in the middle of the screen", { at: [["rec_8d11f9a1c0cb4a02", 6, 26]] }, "edge"],
  ["player portraits listed down the left side while spectating", { classes: ["lethal"] }, "edge"],
  ["a health and stamina bar at the bottom left of the screen", { classes: ["peak"] }, "edge"],
  ["a pale mannequin monster next to a FIRE EXIT sign", { at: [["rec_77c0361d49c14678", 46, 58], ["rec_1297a2d0b54b411e", 94, 108]] }, "object"],
  ["a ghost woman standing in a dark bedroom", { at: [["rec_558b04bdddfb4408", 25, 34]] }, "object"],
  ["a player holding a flashlight in a dark hallway", { classes: ["hallway", "phas"] }, "object"],
  ["a person climbing up a steep cliff", { classes: ["peak"] }, "object"],
  ["a Valorant match", { classes: ["valorant"] }, "name"],
  ["Phasmophobia ghost hunt", { classes: ["phas"] }, "name"],
  ["Lethal Company", { classes: ["lethal"] }, "name"],
  ["League of Legends teamfight", { classes: ["league"] }, "name"],
];
const ABSENT_NEW = [
  "a car racing on a city track at night", "a snowy mountain village with wooden houses", "looking through a sniper scope at a rooftop", "an underwater level with a submarine",
  "a pirate ship sailing on the ocean", "a blocky cave with lava and diamond ore", "a dark sewer tunnel lit by a flashlight", "an abandoned shopping mall at night",
  "a top-down real-time strategy game with tanks", "a cyberpunk rooftop chase in the rain", "a zombie horde in a supermarket", "a chess board with wooden pieces",
  "a soccer stadium crowd", "a kart racing game with bananas", "a spaceship cockpit with stars outside", "a farm with cows and a red barn",
];
const SIMILAR_ABSENT = new Set([5, 6, 7, 8, 9]); // look-alike gaming scenes
const QUALITATIVE = ["Find the monster in the hallway", "Find when I was holding a sniper", "Show me the dark room with my teammates", "Find the scene where an enemy appeared", "when I got a kill", "my teammate died", "an ace"];
// OLD feasibility TUNE set — the only queries thresholds may be tuned on.
const TUNE_ABSENT = ["skiers on a snowy mountain", "a soccer match in a stadium", "an underwater coral reef with fish", "someone cooking in a kitchen", "a racing game with cars on a highway", "a farming game with crops and animals", "a flight simulator cockpit", "a snowy battlefield in a war game", "a sniper looking through a scope over a desert", "a zombie horde attacking in a city street"];
const ANCHORS = ["a dark image", "a bright image", "a blurry image", "a corridor", "a room", "an outdoor scene", "a forest", "a city", "a person", "a monster", "a weapon", "a vehicle", "text on a screen", "a menu", "a map", "a video game", "a screenshot", "a cartoon", "a building", "the sky", "water", "a wall", "a floor", "a light", "darkness", "a crowd", "an animal", "a plant", "a rock", "furniture", "a door", "a window", "a sign", "a logo", "a user interface", "a character", "fire", "smoke", "a road", "grass"];

const textCache = new Map<string, Float32Array>();
const T = async (q: string) => textCache.get(q) ?? (textCache.set(q, await clip.embedText(q)), textCache.get(q)!);

// ── Variants: per-frame similarity for a query ──
type Variant = { name: string; sims: (q: Float32Array) => number[]; transform?: (s: number[], q: Float32Array) => number[] };
const per = (k: string) => (q: Float32Array) => V[k].map((v) => dotA(v, q));
const maxOf = (...ks: string[]) => (q: Float32Array) => V[ks[0]].map((_, i) => Math.max(...ks.map((k) => dotA(V[k][i], q))));
const anchorVecs = await Promise.all(ANCHORS.map(T));
const anchorTop = (k: string) => V[k].map((v) => { const a = anchorVecs.map((e) => dotA(v, e)).sort((x, y) => y - x); return (a[0] + a[1] + a[2]) / 3; });
const anchorCenter = anchorTop("center");
// Nearby-frame evidence: average a frame with its better neighbour (same recording, ≤ 3 s away).
const neigh = frames.map((f, i) => [i - 1, i + 1].filter((j) => frames[j]?.rec === f.rec && Math.abs(frames[j].t - f.t) <= 3000));
const smooth = (s: number[]) => s.map((x, i) => (neigh[i].length ? (x + Math.max(...neigh[i].map((j) => s[j]))) / 2 : x));
const libMedian = (s: number[]) => { const m = [...s].sort((a, b) => a - b)[s.length >> 1]; return s.map((x) => x - m); };
const VARIANTS: Variant[] = [
  { name: "baseline (center crop)", sims: per("center") },
  { name: "pad (letterbox)", sims: per("pad") },
  { name: "squash", sims: per("squash") },
  { name: "3-crop max (L/C/R)", sims: maxOf("center", "left", "right") },
  { name: "center+pad max", sims: maxOf("center", "pad") },
  { name: "nearby-frame smoothing", sims: (q) => smooth(per("center")(q)) },
  { name: "anchor lift", sims: (q) => per("center")(q).map((x, i) => x - anchorCenter[i]) },
  { name: "library-median lift", sims: (q) => libMedian(per("center")(q)) },
  { name: "3-crop max + smoothing", sims: (q) => smooth(maxOf("center", "left", "right")(q)) },
];

const R = vs.VISUAL_RULES;
const BASE = { likelyMin: R.likelyMin, possibleMin: R.possibleMin };
const rows = frames.map((f) => ({ id: f.id, recordingId: f.key, tMs: f.t, embedding: Buffer.alloc(0), model: "clip", intervalMs: 2000 }));
function search(s: number[], restrictKeys?: Set<string>) {
  const scored = rows.map((row, i) => ({ row, sim: s[i] })).filter((x) => !restrictKeys || restrictKeys.has(x.row.recordingId));
  return vs.groupVisual(scored, new Map());
}
const byId = new Map(frames.map((f) => [f.id, f]));

// Tune a variant's likely floor on the OLD TUNE absent set: just above the best absent score (same rule that gave 0.2994 for baseline).
async function tune(v: Variant) {
  let best = -Infinity;
  for (const q of TUNE_ABSENT) best = Math.max(best, ...v.sims(await T(q)));
  return best + 1e-4;
}

type Score = Record<string, number | string>;
async function evaluate(v: Variant, likelyMin: number, gameFilter = false): Promise<Score> {
  R.likelyMin = likelyMin;
  R.possibleMin = likelyMin - (BASE.likelyMin - BASE.possibleMin);
  let answered = 0, likelyAns = 0, top1 = 0, shown = 0, wrongShown = 0, moments = 0, wrongMoments = 0;
  const byKind: Record<string, [number, number]> = {};
  for (const [q, tr, kind] of HELD) {
    let text = vs.describeScene(q);
    let restrict: Set<string> | undefined;
    if (gameFilter) {
      // Grounded filter: a game NAME in the query matches recording metadata (the label map stands in for recordings.game).
      const hit = Object.entries(GAME).find(([, name]) => new RegExp(`\\b${name}\\b`, "i").test(text));
      if (hit) {
        restrict = new Set(frames.filter((f) => cls(f) === hit[0] || (f.key === "splice" && hit[0] === "phas")).map((f) => f.key));
        text = text.replace(new RegExp(`\\b${hit[1]}\\b`, "i"), "").trim() || text;
      }
    }
    const hits = search(v.sims(await T(text)), restrict);
    byKind[kind] ??= [0, 0];
    byKind[kind][1]++;
    if (hits.length) answered++;
    if (hits.some((h) => h.visual.confidence === "likely")) likelyAns++;
    if (hits[0] && ok(byId.get(hits[0].visual.frames[0].frameId)!, tr)) {
      top1++;
      byKind[kind][0]++;
    }
    for (const h of hits) {
      moments++;
      const good = h.visual.frames.filter((f) => ok(byId.get(f.frameId)!, tr)).length;
      shown += h.visual.frames.length;
      wrongShown += h.visual.frames.length - good;
      if (!good) wrongMoments++;
    }
  }
  let absLikely = 0, absAny = 0, simLikely = 0;
  for (const [i, q] of ABSENT_NEW.entries()) {
    const hits = search(v.sims(await T(vs.describeScene(q))));
    if (hits.some((h) => h.visual.confidence === "likely")) {
      absLikely++;
      if (SIMILAR_ABSENT.has(i)) simLikely++;
    }
    if (hits.length) absAny++;
  }
  return {
    variant: v.name + (gameFilter ? " + game filter" : ""), τ: likelyMin.toFixed(4),
    "top-1": `${top1}/${HELD.length}`, answered: `${answered}/${HELD.length}`, "likely-ans": likelyAns,
    "wrong previews": `${wrongShown}/${shown} (${shown ? ((100 * wrongShown) / shown).toFixed(0) : 0}%)`, "wrong moments": `${wrongMoments}/${moments}`,
    "absent likely": `${absLikely}/${ABSENT_NEW.length} (similar ${simLikely}/5)`, "absent any": `${absAny}/${ABSENT_NEW.length}`,
    kinds: Object.entries(byKind).map(([k, [a, b]]) => `${k} ${a}/${b}`).join(" "),
  };
}

// Second held-out set: the feasibility study's HELD queries (never used for τ), labels corrected.
const OLD_HELD: Array<[string, Truth, string]> = [
  ["creepy corridor in a deserted clinic at night", { classes: ["hallway"] }, "scene"], ["scaling a rock wall covered in moss", { classes: ["peak"] }, "scene"],
  ["tactical shooter round with a pistol and an agent ability", { classes: ["valorant"] }, "scene"], ["empty office with yellow walls and fluorescent lights", { classes: ["backrooms"] }, "scene"],
  ["ghost hunting in a pitch-black house with a torch", { classes: ["phas"] }, "scene"], ["a code editor and terminal window on a monitor", { classes: ["desktop"] }, "scene"],
  ["a multiplayer online battle arena seen from above", { classes: ["league"] }, "scene"], ["players in orange space suits in a gloomy building", { classes: ["lethal"] }, "scene"],
  ["a hero shooter in a red-lit futuristic city", { classes: ["rivals"] }, "scene"], ["an overgrown jungle cliff seen in first person", { classes: ["peak"] }, "scene"],
  ["a gloomy hospital corridor with a wheelchair", { classes: ["hallway"] }, "scene"], ["a game made of simple blocky shapes", { classes: ["roblox", "blocky"] }, "scene"],
];
const OLD_ABSENT = ["a cat sleeping on a couch", "a card game table with playing cards", "a sunny beach with palm trees", "a birthday party with balloons", "a spaceship flying through stars", "a medieval knight on horseback", "a horror game in a dark forest at night", "a giant dragon boss fight", "a battle royale parachute drop over an island", "a football video game on a green pitch"];
const EVENTS = ["when I got a kill", "my teammate died", "an ace", "a 4k", "the clutch round", "when we won the round", "a headshot", "when I died to the monster"];
async function evalSet(v: Variant, tau: number, set: typeof HELD, absent: string[]) {
  R.likelyMin = tau; R.possibleMin = tau - 0.03;
  let top1 = 0, shown = 0, wrong = 0, ans = 0;
  for (const [q, tr] of set) {
    const hits = search(v.sims(await T(vs.describeScene(q))));
    if (hits.length) ans++;
    if (hits[0] && ok(byId.get(hits[0].visual.frames[0].frameId)!, tr)) top1++;
    for (const h of hits) for (const f of h.visual.frames) {
      shown++;
      if (!ok(byId.get(f.frameId)!, tr)) wrong++;
    }
  }
  let al = 0, aa = 0;
  for (const q of absent) { const hits = search(v.sims(await T(vs.describeScene(q)))); if (hits.some((h) => h.visual.confidence === "likely")) al++; if (hits.length) aa++; }
  let ev = 0;
  for (const q of EVENTS) { const hits = search(v.sims(await T(vs.describeScene(q)))); if (hits.some((h) => h.visual.confidence === "likely")) ev++; }
  return { variant: v.name, τ: tau.toFixed(4), "top-1": `${top1}/${set.length}`, answered: `${ans}/${set.length}`, "wrong previews": `${wrong}/${shown} (${((100 * wrong) / Math.max(1, shown)).toFixed(0)}%)`, "absent likely": `${al}/${absent.length}`, "absent any": `${aa}/${absent.length}`, "event queries w/ likely": `${ev}/${EVENTS.length}` };
}
if (process.argv.includes("final")) {
  const base = VARIANTS[0];
  console.table([await evaluate(base, 0.3), await evaluate(base, 0.305)]);
  console.table([await evalSet(base, 0.3, OLD_HELD, OLD_ABSENT), await evalSet(base, 0.305, OLD_HELD, OLD_ABSENT), await evalSet(base, 0.3, HELD, ABSENT_NEW), await evalSet(base, 0.305, HELD, ABSENT_NEW)]);
  process.exit(0);
}
if (process.argv.includes("old")) {
  const base = VARIANTS[0], sm = VARIANTS.find((v) => v.name === "nearby-frame smoothing")!;
  console.table([await evalSet(base, BASE.likelyMin, OLD_HELD, OLD_ABSENT), await evalSet(base, await tune(base), OLD_HELD, OLD_ABSENT), await evalSet(sm, await tune(sm), OLD_HELD, OLD_ABSENT)]);
  process.exit(0);
}
const results: Score[] = [];
for (const v of VARIANTS) {
  const tau = v.name.startsWith("baseline") ? BASE.likelyMin : await tune(v);
  results.push(await evaluate(v, tau));
  if (v.name.startsWith("baseline")) results.push(await evaluate(v, await tune(v)), await evaluate(v, BASE.likelyMin, true));
}
console.table(results);

// Detail for baseline: per query top hits.
R.likelyMin = BASE.likelyMin; R.possibleMin = BASE.possibleMin;
const detail = async (v: Variant, qs: string[]) => {
  for (const q of qs) {
    const hits = search(v.sims(await T(vs.describeScene(q))));
    console.log(`  ${q} → ${hits.slice(0, 3).map((h) => `${h.recordingId.slice(0, 8)}@${(h.startMs / 1000).toFixed(0)}s[${h.visual.frames.map((f) => cls(byId.get(f.frameId)!)).join(",")}] ${h.visual.confidence} ${h.visual.similarity}`).join(" | ") || "no result"}`);
  }
};
if (process.argv.includes("v")) {
  console.log("\nBASELINE held-out detail:"); await detail(VARIANTS[0], HELD.map((h) => h[0]));
  console.log("\nBASELINE absent detail:"); await detail(VARIANTS[0], ABSENT_NEW);
  console.log("\nBASELINE qualitative:"); await detail(VARIANTS[0], QUALITATIVE);
}
