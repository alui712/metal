// The 3-minute demo journey at 1920×1080 (docs/demo/README.md). Runs against the
// live library: it saves one Smart Clip, creates one story and renders one MP4.
// Defaults are this machine's demo library; override with the env vars below.
import { execFileSync } from "node:child_process";
import path from "node:path";
const env = process.env;
const B = env.METAL_URL ?? "http://localhost:3001";
const DATA = path.resolve(env.METAL_DATA_DIR ?? "data");
const REAL = env.DEMO_RECORDING ?? "rec_e7b825de2ee84812"; // analyzed real gameplay
const NIGHT = env.DEMO_SESSION ?? "ses_ff7f7d4fed344998"; // a real night with ≥2 moments
const POV_A = env.DEMO_POV_A ?? "rec_557a1fbf174d4bbc"; // a paired POV (sample fixture)
const POV_B = env.DEMO_POV_B ?? "rec_951f07a320334cb7";
const EXACT = env.DEMO_QUERY ?? "two enemies on the stairs";
const MEANING = env.DEMO_PARAPHRASE ?? "the match was really close";
const sql = (q) => JSON.parse(execFileSync("sqlite3", ["-json", `${DATA}/metal.db`, q]).toString() || "[]");
const probe = (f) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", f]).toString());
export default async function demoJourney(t) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const has = (s) => t.eval(`document.body.innerText.includes(${JSON.stringify(s)})`);
  const btn = (text) => t.eval(`(() => { const b = [...document.querySelectorAll("button")].find(b => b.textContent.trim().startsWith(${JSON.stringify(text)})); if (!b) return false; b.click(); return true; })()`);
  const fits = () => t.eval(`document.documentElement.scrollWidth <= innerWidth`);
  await t.viewport(1920, 1080);

  t.step("capture");
  await t.goto(`${B}/`, 3000);
  const obs = await t.eval(`document.querySelector("main").innerText.match(/(Connected|Recording|Replay buffer)[^\\n]{0,40}/)?.[0] ?? ""`);
  t.check(`capture dashboard shows live OBS state (${obs})`, obs.length > 3 && (await fits()));
  await t.shot("1-capture");

  t.step("smart clip");
  await t.goto(`${B}/recordings/${REAL}`, 3500);
  const cards = await t.eval(`document.querySelectorAll('ol[aria-label="Suggested clips"] > li').length`);
  t.check(`real recording has measured suggestions (${cards})`, cards >= 2 && (await has("Sudden loud sound")));
  t.check("suggestions are labelled as measured loudness, not game events", !(await has("kill")) && !(await has("laugh")));
  await t.shot("2-smartclip");
  const sug = (await t.eval(`fetch("/api/recordings/${REAL}/analysis").then(r => r.json()).then(d => d.suggestions)`)).filter((s) => s.status !== "dismissed");
  const target = sug[sug.length - 1];
  await t.eval(`document.querySelectorAll('ol[aria-label="Suggested clips"] > li')[${sug.length - 1}].querySelector("button") && [...document.querySelectorAll('ol[aria-label="Suggested clips"] > li')[${sug.length - 1}].querySelectorAll("button")].find(b => b.textContent.includes("Save clip"))?.click()`);
  let clipHref = null;
  for (let i = 0; i < 60 && !clipHref; i++) { await wait(1000); clipHref = await t.eval(`[...document.querySelectorAll('ol[aria-label="Suggested clips"] > li')[${sug.length - 1}].querySelectorAll('a')].find(a => a.textContent.includes("Open clip"))?.getAttribute("href") ?? null`); }
  t.check(`clip saved from real footage (${clipHref})`, !!clipHref);
  if (clipHref) {
    const clipId = clipHref.split("/").pop();
    const [c] = sql(`select coalesce(proxy_path, original_path) p, parent_recording_id parent from recordings where id='${clipId}'`);
    const d = +probe(`${DATA}/media/${c.p}`).format.duration;
    const want = (target.endMs - target.startMs) / 1000;
    t.check(`clip is the exact range of its real source (${d.toFixed(2)} s vs ${want} s, parent ${c.parent})`, c.parent === REAL && Math.abs(d - want) < 0.2);
    await t.goto(`${B}${clipHref}`, 3000);
    const play = await t.eval(`(async () => { const v = document.querySelector("video"); v.muted = true; await v.play(); await new Promise(r => setTimeout(r, 1200)); return v.currentTime; })()`);
    t.check(`saved clip plays (${play.toFixed(2)} s in)`, play > 0.5);
  }

  t.step("recall");
  await t.goto(`${B}/recall?q=${encodeURIComponent(EXACT)}`, 3500);
  const r1 = await t.eval(`[...document.querySelectorAll('ol[aria-label="Results"] > li')].map(li => li.innerText.replace(/\\s+/g, " "))`);
  t.check(`exact speech found (${r1[0]?.slice(0, 60)})`, r1[0]?.includes("Strong match"));
  await t.goto(`${B}/recall?q=${encodeURIComponent(MEANING)}`, 3500);
  const r2 = await t.eval(`[...document.querySelectorAll('ol[aria-label="Results"] > li')].map(li => li.innerText.replace(/\\s+/g, " "))`);
  t.check(`paraphrase finds the meaning (${r2[0]?.slice(0, 60)})`, r2.length > 0);
  await t.eval(`document.querySelector("video").muted = true; document.querySelector('ol[aria-label="Results"] button').click()`);
  await wait(2000);
  const ct = await t.eval(`document.querySelector("video").currentTime`);
  const spoken = await t.eval(`Number(new URL([...document.querySelectorAll("a")].find(a => a.textContent.includes("Open recording")).href).searchParams.get("t")) / 1000`);
  t.check(`result plays at its spoken timestamp (${ct.toFixed(2)} vs ${spoken})`, ct >= spoken - 0.1 && ct < spoken + 3.5);
  await t.shot("3-recall");

  t.step("time machine");
  await t.goto(`${B}/sessions/${NIGHT}`, 3500);
  t.check("night lists its recordings", (await t.eval(`document.querySelectorAll('a[href^="/recordings/"]').length`)) >= 2);
  await btn("Select all");
  await wait(400);
  const relive = await t.eval(`[...document.querySelectorAll("a")].find(a => /Relive \\d+ selected/.test(a.textContent))?.getAttribute("href")`);
  t.check(`moments selectable for Relive (${relive})`, !!relive);
  await t.shot("4-session");
  await t.goto(`${B}${relive}`, 4000);
  const rv = await t.eval(`(() => { const v = document.querySelector("video[data-active=true]") ?? document.querySelector("video"); return { t: v.currentTime, paused: v.paused, src: v.getAttribute("src") }; })()`);
  t.check(`relive plays real footage (${rv.src} @ ${rv.t.toFixed(1)} s)`, !rv.paused && rv.src?.startsWith("/api/media/") && rv.t > 0);
  await t.shot("5-relive");
  await t.goto(`${B}/sessions/${NIGHT}`, 3000);
  await btn("Select all");
  await wait(300);
  await btn("Send ");
  await wait(4500);
  const story = await t.eval(`new URLSearchParams(location.search).get("story")`);
  const clips = await t.eval(`document.querySelectorAll("[data-clip]").length`);
  t.check(`real night → Story Studio (${story}, ${clips} clips)`, /^sty_/.test(story ?? "") && clips >= 2);

  t.step("multi-pov");
  const [g] = sql(`select group_id from pov_members where recording_id='${POV_A}'`);
  await t.goto(`${B}/povs/${g.group_id}?rec=${POV_A}`, 3500);
  await t.eval(`document.querySelectorAll("video").forEach(v => v.muted = true)`);
  await t.eval(`document.activeElement?.blur()`);
  for (let i = 0; i < 4; i++) { await t.key("ArrowRight"); await wait(250); }
  await wait(1200);
  await t.key("2", { code: "Digit2", text: "2" });
  await wait(800);
  const pv = await t.eval(`(() => { const o = {}; document.querySelectorAll("[data-pov]").forEach(d => { const v = d.querySelector("video"); o[d.dataset.pov] = { T: v.currentTime * 1000 + Number(d.dataset.offset), active: d.dataset.active === "true" }; }); return o; })()`);
  const A = pv[POV_A], Bv = pv[POV_B];
  t.check(`after seeking 20 s, switch keeps the moment (A ${A.T.toFixed(0)} → B ${Bv.T.toFixed(0)} ms)`, Bv.active && A.T > 15000 && Math.abs(A.T - Bv.T) < 60);
  t.check("viewer fits 1920×1080", await fits());
  await t.shot("6-pov");

  t.step("studio export");
  await t.goto(`${B}/studio?story=${story}`, 3500);
  t.check("studio fits 1920×1080", await fits());
  await t.shot("7-studio");
  const planned = sql(`select sum(out_ms - in_ms) / 1000.0 s from story_clips where project_id='${story}'`)[0].s;
  await btn("Export");
  await wait(800);
  await btn("Render MP4");
  for (let i = 0; i < 240 && !(await has("Download MP4")); i++) await wait(500);
  const exp = await t.eval(`fetch("/api/stories/${story}/export").then(r => r.json()).then(j => j.exports[0])`);
  t.check(`export finished (${exp?.status})`, exp?.status === "done" && !!exp.fileUrl);
  if (exp?.status === "done") {
    const p = probe(`${DATA}/exports/${exp.id}.mp4`);
    const v = p.streams.find((s) => s.codec_type === "video"), a = p.streams.find((s) => s.codec_type === "audio");
    t.check(`MP4: ${v.width}×${v.height} ${v.codec_name}/${a?.codec_name} ${(+p.format.duration).toFixed(2)} s vs planned ${planned} s`, v.codec_name === "h264" && a?.codec_name === "aac" && Math.abs(+p.format.duration - planned) < 0.2);
    await t.eval(`(() => { const v = document.querySelector('video[aria-label="Exported story video"]'); v.muted = true; return v.play(); })()`);
    await wait(1500);
    t.check("exported MP4 plays in the app", (await t.eval(`document.querySelector('video[aria-label="Exported story video"]').currentTime`)) > 0.5);
    t.check("download link served", (await t.eval(`fetch(${JSON.stringify(exp.fileUrl)}, { method: "HEAD" }).then(r => r.status)`)) === 200);
  }
  await t.shot("8-export");
}
