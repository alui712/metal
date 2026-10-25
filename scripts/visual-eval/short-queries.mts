// Short-query pass (docs/visual-recall.md, "Short queries"): raw query vs SCENE_PROMPTS ensemble, scored with the app's grouping.
// Floors are tuned on the tuning sets only; the two held-out sets are reported, never tuned on.
// Usage: DB=<indexed copy of the library>/metal.db METAL_DATA_DIR=<that dir> npx tsx scripts/visual-eval/short-queries.mts — read-only.
import { openDb } from "../../src/server/db/client";
import { embedText } from "../../src/server/visual/clip";
import { dot, fromBlob } from "../../src/server/search/embed";
import { VISUAL_RULES, embedScene, groupVisual } from "../../src/server/visual/search";

type Truth = { classes?: string[]; at?: Array<[string, number, number]> };
type Row = { id: string; recordingId: string; tMs: number; embedding: Buffer; model: string; intervalMs: number | null };
type Hit = ReturnType<typeof groupVisual>[number];
type Result = ReturnType<typeof run>[number];
const LABEL: Record<string, (t: number) => string> = {
  rec_77c0361d49c14678: () => "lethal", rec_1297a2d0b54b411e: () => "lethal",
  rec_87757b552fed4264: () => "hallway", rec_15303b9d9ec5480a: () => "hallway", rec_3487fb1a796747fd: () => "phas", rec_558b04bdddfb4408: () => "phas",
  rec_8d11f9a1c0cb4a02: () => "backrooms", rec_b62aa9c884a84e47: () => "backrooms", rec_cda5ff4e0e324829: () => "peak", rec_8447152d28794042: (t) => (t >= 6 ? "logo" : "peak"),
  rec_2a9084d48d7f4a4d: () => "valorant", rec_6520f3fcd3324fb8: () => "valorant", rec_a5113821afb84bb5: () => "league", rec_f0bd67b32fdc448e: () => "rivals",
  rec_ff7f7d4fed344998: () => "roblox", rec_86a2c06ecf944d68: () => "roblox", rec_e7b825de2ee84812: () => "roblox", rec_b05cf0a9d8454077: () => "roblox",
  rec_6c652660fb6f42d0: () => "desktop", rec_6caef0437dd74ddf: () => "desktop", rec_8235e769112f4c4c: () => "desktop",
};
// Existing calibration set (scripts/visual-eval/validate.ts) — thresholds may be tuned on these only.
const LONG_PRESENT: Array<[string, string[]]> = [
  ["creepy corridor in a deserted clinic at night", ["hallway"]], ["scaling a rock wall covered in moss", ["peak"]],
  ["tactical shooter round with a pistol and an agent ability", ["valorant"]], ["empty office with yellow walls and fluorescent lights", ["backrooms"]],
  ["ghost hunting in a pitch-black house with a torch", ["phas"]], ["a code editor and terminal window on a monitor", ["desktop"]],
  ["a multiplayer online battle arena seen from above", ["league"]], ["players in orange space suits in a gloomy building", ["lethal"]],
  ["a hero shooter in a red-lit futuristic city", ["rivals"]], ["an overgrown jungle cliff seen in first person", ["peak"]],
  ["a gloomy hospital corridor with a wheelchair", ["hallway"]], ["a game made of simple blocky shapes", ["roblox"]],
];
const LONG_ABSENT: string[] = ["a cat sleeping on a couch", "a card game table with playing cards", "a sunny beach with palm trees", "a birthday party with balloons", "a spaceship flying through stars", "a medieval knight on horseback", "a horror game in a dark forest at night", "a giant dragon boss fight", "a battle royale parachute drop over an island", "a football video game on a green pitch"];
// Held out: short queries written for this pass, never used to pick thresholds.
const SHORT_PRESENT: Array<[string, string[]]> = [
  ["jungle", ["peak"]], ["green jungle", ["peak"]], ["climbing a green jungle mountain", ["peak"]], ["rocky cliff", ["peak"]], ["mountain", ["peak"]], ["moss", ["peak"]],
  ["hospital corridor", ["hallway"]], ["yellow office", ["backrooms"]], ["fluorescent lights", ["backrooms"]], ["ghost hunting", ["phas"]], ["dark house", ["phas", "hallway"]],
  ["code editor", ["desktop"]], ["terminal", ["desktop"]], ["space suits", ["lethal"]], ["blocky", ["roblox"]], ["top-down battle arena", ["league"]], ["futuristic city", ["rivals"]], ["pistol", ["valorant"]],
];
const SHORT_ABSENT: string[] = ["underwater", "beach", "snow", "kitchen", "cat", "racing car", "dragon", "spaceship", "desert", "castle", "football", "fireworks", "a dog", "lava", "airplane"];
const HELD_B: Array<[string, Truth]> = [
  ["spectating a crewmate in a hazmat suit with an oxygen tank", { classes: ["lethal"] }], ["a beige hospital hallway lit by ceiling lights", { classes: ["hallway"] }],
  ["a night-vision style camera view in a dark house", { classes: ["phas"] }], ["endless mono-yellow rooms with damp carpet", { classes: ["backrooms"] }],
  ["hands with blue gloves gripping a mossy rock", { classes: ["peak"] }], ["a tactical shooter holding a pink knife skin", { classes: ["valorant"] }],
  ["a futuristic shooter with red neon lighting and lasers", { classes: ["rivals"] }], ["a neon purple arena inside a game editor window", { classes: ["roblox"] }],
  ["a cartoon cat face logo on a black background", { classes: ["logo"] }], ["a webpage and code editor on a computer screen", { classes: ["desktop"] }],
  ["a fantasy battlefield with a minimap in the bottom right corner", { classes: ["league"] }], ["a circular minimap in the top-left corner of a shooter", { classes: ["valorant"] }],
  ["an inventory grid of items in the middle of the screen", { at: [["rec_8d11f9a1c0cb4a02", 6, 26]] }], ["player portraits listed down the left side while spectating", { classes: ["lethal"] }],
  ["a health and stamina bar at the bottom left of the screen", { classes: ["peak"] }], ["a pale mannequin monster next to a FIRE EXIT sign", { at: [["rec_77c0361d49c14678", 46, 58], ["rec_1297a2d0b54b411e", 94, 108]] }],
  ["a ghost woman standing in a dark bedroom", { at: [["rec_558b04bdddfb4408", 25, 34]] }], ["a player holding a flashlight in a dark hallway", { classes: ["hallway", "phas"] }],
  ["a person climbing up a steep cliff", { classes: ["peak"] }], ["a Valorant match", { classes: ["valorant"] }], ["Phasmophobia ghost hunt", { classes: ["phas"] }],
  ["Lethal Company", { classes: ["lethal"] }], ["League of Legends teamfight", { classes: ["league"] }],
];
const ABSENT_B = ["a car racing on a city track at night", "a snowy mountain village with wooden houses", "looking through a sniper scope at a rooftop", "an underwater level with a submarine", "a pirate ship sailing on the ocean", "a blocky cave with lava and diamond ore", "a dark sewer tunnel lit by a flashlight", "an abandoned shopping mall at night", "a top-down real-time strategy game with tanks", "a cyberpunk rooftop chase in the rain", "a zombie horde in a supermarket", "a chess board with wooden pieces", "a soccer stadium crowd", "a kart racing game with bananas", "a spaceship cockpit with stars outside", "a farm with cows and a red barn"];
const TUNE_ABSENT = ["skiers on a snowy mountain", "a soccer match in a stadium", "an underwater coral reef with fish", "someone cooking in a kitchen", "a racing game with cars on a highway", "a farming game with crops and animals", "a flight simulator cockpit", "a snowy battlefield in a war game", "a sniper looking through a scope over a desert", "a zombie horde attacking in a city street"];
const db = openDb(process.env.DB!);
const rows = (db.$client.prepare("select f.id, f.recording_id recordingId, f.t_ms tMs, f.embedding, f.model, i.interval_ms intervalMs from visual_frames f join recording_visual_index i on i.recording_id = f.recording_id").all() as Row[]).filter((r) => LABEL[r.recordingId]);
const V = rows.map((r) => fromBlob(r.embedding));
const dur = new Map(rows.map((r) => [r.recordingId, (db.$client.prepare("select duration_ms d from recordings where id=?").get(r.recordingId) as { d: number }).d]));
const ok = (rec: string, tMs: number, tr: Truth) => (tr.classes?.includes(LABEL[rec](tMs / 1000)) ?? false) || (tr.at?.some(([k, a, b]) => k === rec && tMs / 1000 >= a && tMs / 1000 <= b) ?? false);
type Q = { set: string; q: string; tr: Truth | null };
const P = (set: string, l: Array<[string, string[] | Truth]>) => l.map(([q, w]) => ({ set, q, tr: Array.isArray(w) ? { classes: w } : w }));
const A = (set: string, l: string[]) => l.map((q) => ({ set, q, tr: null }));
const all: Q[] = [...P("tune+", LONG_PRESENT), ...A("tune-unrel", [...LONG_ABSENT.slice(0, 6), ...TUNE_ABSENT]), ...A("tune-sim", LONG_ABSENT.slice(6)),
  ...P("A+ short", SHORT_PRESENT), ...A("A- short", SHORT_ABSENT), ...P("B+ quality", HELD_B), ...A("B- unrel", ABSENT_B.filter((_, i) => i < 5 || i > 9)), ...A("B- sim", ABSENT_B.slice(5, 10))];
const sims: Record<string, number[][]> = { raw: [], ens: [] };
for (const x of all) { const r = await embedText(x.q), e = await embedScene(x.q); sims.raw.push(V.map((v) => dot(r, v))); sims.ens.push(V.map((v) => dot(e, v))); }
function run(k: "raw" | "ens", likely: number, possible: number) {
  Object.assign(VISUAL_RULES, { likelyMin: likely, possibleMin: possible });
  return all.map((x, qi) => {
    const hits = groupVisual(rows.map((row, i) => ({ row, sim: sims[k][qi][i] })), dur);
    const good = (h: Hit) => x.tr && h.visual.frames.some((f) => ok(h.recordingId, f.tMs, x.tr!));
    return { ...x, n: hits.length, likely: hits.some((h) => h.visual.confidence === "likely"), top1: !!hits[0] && !!good(hits[0]), sim: hits[0]?.visual.similarity ?? null, conf: hits[0]?.visual.confidence ?? null, prec: hits.length ? hits.filter(good).length / hits.length : null };
  });
}
const sum = (r: Result[], set: string) => {
  const s = r.filter((x) => x.set === set);
  if (set.includes("+")) return `top-1 ${s.filter((x) => x.top1).length}/${s.length} · any ${s.filter((x) => x.n).length} · likely&correct ${s.filter((x) => x.likely && x.top1).length}`;
  return `likely FP ${s.filter((x) => x.likely).length} · low-only ${s.filter((x) => x.n && !x.likely).length} · none ${s.filter((x) => !x.n).length}/${s.length}`;
};
const base = run("raw", 0.3, 0.27);
const baseSim = base.filter((x) => x.set === "tune-sim" && x.likely).length;
let best: { score: number; l: number; p: number } | null = null;
for (let p = 0.28; p <= 0.36; p += 0.0025) for (let l = p; l <= 0.38; l += 0.0025) {
  const r = run("ens", l, p);
  if (r.some((x) => x.set === "tune-unrel" && x.n)) continue;
  if (r.filter((x) => x.set === "tune-sim" && x.likely).length > baseSim) continue;
  const T = r.filter((x) => x.set === "tune+");
  const score = T.filter((x) => x.top1).length * 1000 + T.filter((x) => x.likely && x.top1).length * 10 - r.filter((x) => x.set === "tune-sim" && x.n).length + p + l;
  if (!best || score > best.score) best = { score, l: +l.toFixed(4), p: +p.toFixed(4) };
}
const tuned = best!;
const ens = run("ens", tuned.l, tuned.p);
console.log(`BEFORE raw query, likely ≥0.300 / low ≥0.270   AFTER prompt ensemble, likely ≥${tuned.l} / low ≥${tuned.p} (tuned on tune* only)`);
for (const set of [...new Set(all.map((x) => x.set))]) console.log(set.padEnd(11), "BEFORE", sum(base, set).padEnd(44), "AFTER", sum(ens, set));
const f = (x: Result) => (x.n ? `${x.n}× ${x.conf} ${x.sim} ${x.top1 ? "✓" : x.tr ? "✗" : "FP"}` : "none");
console.log("\nheld-out per query (before → after):");
all.forEach((x, i) => { if (!x.set.startsWith("tune")) console.log(x.set.padEnd(11), x.q.slice(0, 46).padEnd(47), f(base[i]).padEnd(22), "→", f(ens[i])); });
