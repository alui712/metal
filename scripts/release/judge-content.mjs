// Approved judge content through the real UI: Multi-POV → side by side → Clip both POVs →
// trim → caption → rename → Export. WRITES one story and one export; run once, before "lock".
//   METAL_URL=http://127.0.0.1:3001 node scripts/demo-check/cdp.mjs scripts/release/judge-content.mjs
// Prints `RESULT {storyId, export: {id}}` for judge-demo.json ("story", "exports").
const B = process.env.METAL_URL;
const GROUP = "pov_f0d531b728c341d7";
const PEAK = "rec_cda5ff4e0e324829";
const CAPTION = "Same moment. Two perspectives.";
const TITLE = "PEAK — two POVs, side by side";
const byText = (t, sel = "button") => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.includes(${JSON.stringify(t)}))`;

export default async function judgeContent(t) {
  const out = {};
  await t.viewport(1440, 900);
  await t.goto(`${B}/povs/${GROUP}?rec=${PEAK}&t=6000`, 2500);
  await t.key("v");
  await t.sleep(1200);
  await t.eval(`${byText("Clip both POVs to Story Studio")}.setAttribute("data-t", "clip"), 0`);
  await t.click(`[data-t=clip]`);
  for (let i = 0; i < 40 && !(await t.eval(`location.search.includes("story=")`)); i++) await t.sleep(250);
  await t.sleep(2500);
  const id = await t.eval(`new URLSearchParams(location.search).get("story")`);
  out.storyId = id;
  t.check("story created from the synced pair", /^sty_/.test(id ?? ""), id ?? "");
  // peak pov 2 fades into a "Clipped with Medal" end card at 5.62 s of its own time; end the clip before it.
  await t.eval(`(() => { const r = document.querySelectorAll("fieldset input[type=range]")[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(r, "8000"); r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); return 0; })()`);
  await t.sleep(1500);
  await t.eval(`(() => { const el = document.querySelector("#clip-caption"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(CAPTION)}); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return 0; })()`);
  await t.sleep(3000);
  const ren = await t.eval(`fetch("/api/stories/${id}", { method: "PATCH", headers: { "Content-Type": "application/json", "x-metal-action": "1" }, body: JSON.stringify({ title: ${JSON.stringify(TITLE)} }) }).then((r) => r.status)`);
  const v = await t.eval(`fetch("/api/stories/${id}").then((r) => r.json())`);
  const c = v.project.clips[0];
  out.clip = c;
  t.check("renamed", ren === 200 && v.project.title === TITLE, `${ren} ${v.project.title}`);
  t.check("one split clip with the caption", v.project.clips.length === 1 && !!c.secondary && c.caption === CAPTION, JSON.stringify(c));
  const secondEnd = c.outMs - c.inMs + c.secondary.inMs;
  t.check(`second POV ends before its end card (${secondEnd} ms < 5620)`, secondEnd <= 5550 && c.outMs - c.inMs >= 5000, `${c.inMs}-${c.outMs}`);
  await t.goto(`${B}/studio?story=${id}`, 3000);
  await t.eval(`${byText("Export")}.setAttribute("data-t", "export"), 0`);
  await t.click(`[data-t=export]`);
  await t.sleep(800);
  await t.eval(`${byText("Render MP4")}.setAttribute("data-t", "render"), 0`);
  await t.click(`[data-t=render]`);
  let e = null;
  for (let i = 0; i < 240; i++) {
    await t.sleep(1000);
    e = (await t.eval(`fetch("/api/stories/${id}").then((r) => r.json())`)).exports[0];
    if (e && (e.status === "done" || e.status === "failed")) break;
  }
  out.export = e;
  t.check("export finished", e?.status === "done", JSON.stringify(e));
  console.log("RESULT " + JSON.stringify(out));
}
