// Recall with speech + experimental scene search (ADR 0022), against a live app and worker.
//   METAL_URL=http://127.0.0.1:3108 METAL_DATA_DIR=<data> node scripts/demo-check/cdp.mjs scripts/demo-check/recall-visual.mjs
// Expects real gameplay recordings already visually indexed, and NEW_RECORDING (not yet indexed) to index from the UI.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const env = process.env;
const B = env.METAL_URL ?? "http://127.0.0.1:3108";
const DATA = path.resolve(env.METAL_DATA_DIR ?? "data");
const SPOKEN = env.SPOKEN ?? "Did that bug just die?";
const NEW = env.NEW_RECORDING ?? "rec_558b04bdddfb4408";
const sql = (q) => JSON.parse(execFileSync("sqlite3", ["-json", `${DATA}/metal.db`, q]).toString() || "[]");

export default async function recallVisual(t) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const has = (s) => t.eval(`document.body.innerText.includes(${JSON.stringify(s)})`);
  const fits = () => t.eval(`document.documentElement.scrollWidth <= innerWidth`);
  const toggle = () => t.eval(`document.querySelector('button[aria-pressed]')?.getAttribute("aria-pressed") ?? null`);
  // Result cards: title, timecode, badge, thumbnails (loaded?), and quoted lines.
  const cards = () => t.eval(`[...document.querySelectorAll('ol[aria-label="Results"] > li')].map(li => ({
    text: li.innerText.split("\\n").slice(0, 3).join(" | "),
    approx: li.innerText.includes("approximate"),
    thumbs: [...li.querySelectorAll("img")].map(i => i.complete && i.naturalWidth > 0),
    quote: li.innerText.includes("“"),
  }))`);
  const search = async (q, visual) => {
    await t.goto(`${B}/recall?q=${encodeURIComponent(q)}${visual ? "&visual=1" : ""}`, 1500);
    for (let i = 0; i < 40 && (await has(`Searching for “${q}”`)); i++) await wait(500);
    await wait(800);
    return cards();
  };
  await t.viewport(1440, 1000);

  t.step("default is speech only");
  await t.goto(`${B}/recall`, 2500);
  t.check("Scenes toggle present and off by default", (await toggle()) === "false");
  t.check("status line labels scene search experimental", await has("Scene search (experimental)"));
  await t.shot("v1-recall-default");

  t.step("speech");
  let r = await search(SPOKEN, false);
  t.check(`speech search finds the spoken line (${r.length} results)`, r.length > 0 && r[0].quote && !r[0].approx, r[0]?.text);
  const open = await t.eval(`document.querySelector('a[href^="/recordings/"]')?.getAttribute("href") ?? ""`);
  t.check(`"Open recording" goes to the timestamp (${open})`, /^\/recordings\/rec_[0-9a-f]{16}\?t=\d+$/.test(open));
  await t.shot("v2-speech");

  t.step("scene off");
  const SCENE = "first-person view climbing a mossy rock cliff with gloved hands";
  r = await search(SCENE, false);
  t.check(`scene words with Scenes off return no visual matches (${r.length})`, r.every((c) => !c.approx));

  t.step("scene on");
  r = await search(SCENE, true);
  t.check("Scenes toggle reflects ?visual=1", (await toggle()) === "true");
  const top = r[0];
  t.check(`scene search returns approximate visual matches (${r.length})`, r.length > 0 && top.approx, top?.text);
  t.check("top match is a PEAK climbing recording", /peak pov/.test(top?.text ?? ""), top?.text);
  t.check("thumbnails are real loaded frames", r.every((c) => !c.thumbs.length || c.thumbs.every(Boolean)) && (top?.thumbs.length ?? 0) > 0);
  t.check("visual matches are labelled approximate and never 'verified'", (await has("approximate")) && !(await has("erified")));
  // Clicking an evidence frame plays from that moment.
  const frameT = await t.eval(`(() => { const b = [...document.querySelectorAll("button")].find(b => b.querySelector("img") && /^\\d+:\\d\\d · /.test(b.innerText.trim())); if (!b) return null; b.click(); return b.innerText.trim().split(" ")[0]; })()`);
  await wait(2500);
  const cur = await t.eval(`document.querySelector("video")?.currentTime ?? -1`);
  const [m, s] = (frameT ?? "0:0").split(":").map(Number);
  t.check(`clicking frame ${frameT} plays near it (video at ${cur.toFixed(1)} s)`, frameT !== null && cur >= m * 60 + s - 1.5 && cur <= m * 60 + s + 4);
  const openV = await t.eval(`document.querySelector('a[href^="/recordings/"]')?.getAttribute("href") ?? ""`);
  t.check(`visual match opens the recording at its time (${openV})`, /\?t=\d+$/.test(openV));
  await t.shot("v3-scene");

  t.step("absent scenes");
  for (const q of ["driving a car on a highway", "a dragon breathing fire", "a player swimming underwater"]) {
    r = await search(q, true);
    const likely = r.filter((c) => /Looks similar/.test(c.text));
    t.check(`"${q}": no convincing match (${r.length} shown, ${likely.length} "Looks similar")`, likely.length === 0, r.map((c) => c.text).join(" ;; ").slice(0, 300));
  }
  await t.shot("v4-absent");

  t.step("actions and events");
  r = await search("getting four kills", true);
  t.check(`event query: no 'Looks similar' claims (${r.length} shown)`, r.every((c) => !/Looks similar/.test(c.text)));
  t.check("event query warns that kills/aces aren't recognised (when visual hits show)", !r.some((c) => c.approx) || (await has("can’t recognise kills")));
  r = await search("jumping across a gap", true);
  t.check(`action query copy says jumps can't be confirmed (${r.length} shown)`, await has("can’t confirm actions like jumps, kills or aces"));
  await t.shot("v5-action");

  t.step("index a new recording from the UI");
  await t.goto(`${B}/recordings/${NEW}`, 3500);
  const clicked = await t.eval(`(() => { const b = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Index visuals"); if (!b) return false; b.click(); return true; })()`);
  t.check("recording page offers Index visuals", clicked);
  let st = "";
  for (let i = 0; i < 90 && st !== "done" && st !== "failed"; i++) { await wait(1000); st = sql(`select status from recording_visual_index where recording_id='${NEW}'`)[0]?.status ?? ""; }
  await wait(2500);
  t.check(`new recording indexed (${st})`, st === "done" && (await has("Re-index")));
  await t.shot("v6-indexed");
  r = await search("a night-vision camera view in a dark house", true);
  const title = sql(`select title from recordings where id='${NEW}'`)[0].title;
  t.check(`the newly indexed "${title}" is searchable`, r.some((c) => c.text.includes(title)), r.map((c) => c.text).join(" ;; ").slice(0, 300));

  t.step("judge scope and phone width");
  // The guided tour opens Recall scoped to the prepared recording (the one with the spoken line).
  const prepared = open.match(/rec_[0-9a-f]{16}/)[0];
  await t.goto(`${B}/recall?judge=1&visual=1&recording=${prepared}&q=${encodeURIComponent("spectating a crewmate in a dark room with pink lamps")}`, 3000);
  const allowed = JSON.parse(fs.readFileSync(`${DATA}/judge-demo.json`, "utf8")).recordings.map((x) => (typeof x === "string" ? x : x.id));
  const ids = await t.eval(`fetch("/api/recall?judge=1&visual=1&recording=${prepared}&q=spectating%20a%20crewmate%20in%20a%20dark%20room%20with%20pink%20lamps").then(r => r.json()).then(d => d.results.map(h => h.recordingId))`);
  t.check(`judge mode keeps scene results inside the prepared recording (${ids.length})`, ids.length > 0 && ids.every((id) => id === prepared && allowed.includes(id)));
  await t.viewport(390, 844, true);
  await search(SCENE, true);
  t.check("Recall with scene results fits a phone", await fits());
  await t.shot("v7-phone");
}
