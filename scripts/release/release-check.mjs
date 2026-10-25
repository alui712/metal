// Release check with "lock": true: guided demo with the approved split-screen export, Recall (speech + scenes),
// Multi-POV and navigation. Read-only unless ORDINARY_STORY is set (then it renders one export of that story).
//   METAL_URL=… STORY=sty_… EXPORT=exp_… node scripts/demo-check/cdp.mjs scripts/release/release-check.mjs
const B = process.env.METAL_URL;
const J = { night: "ses_8d11f9a1c0cb4a02", pov: "pov_f0d531b728c341d7", story: process.env.STORY, exp: process.env.EXPORT, line: "Did that bug just die?" };
const byText = (s, sel = "button,a") => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((b) => b.textContent.trim().includes(${JSON.stringify(s)}))`;

export default async function releaseCheck(t) {
  const has = (s) => t.eval(`document.body.innerText.includes(${JSON.stringify(s)})`);
  const fits = () => t.eval(`document.documentElement.scrollWidth <= innerWidth`);
  const tag = (expr, id) => t.eval(`(() => { const el = ${expr}; if (!el) return false; el.setAttribute("data-t", ${JSON.stringify(id)}); return true; })()`);
  const until = async (cond, n = 80) => { for (let i = 0; i < n && !(await t.eval(cond)); i++) await t.sleep(100); return t.eval(cond); };
  await t.viewport(1920, 1080);

  t.step("guided demo");
  await t.goto(`${B}/showcase`, 2500);
  await tag(byText("Start guided demo", "button"), "start");
  const t0 = Date.now();
  await t.click("[data-t=start]");
  t.check("Memory Dive → judge Recall", await until(`location.pathname === "/recall" && location.search.includes("judge=1")`, 40), `${Date.now() - t0} ms`);
  await t.sleep(2500);
  t.check("approved line found", await has("Did that bug just die"));
  t.check("Scenes off by default in the tour", await t.eval(`document.querySelector('button[aria-pressed]')?.getAttribute("aria-pressed") !== "true"`));
  await t.click('[aria-label="Step 2: Time Machine"]');
  t.check("step 2: approved night", await until(`location.pathname === "/sessions/${J.night}"`));
  await t.sleep(2000);
  if (await tag(byText("Relive this night"), "relive")) {
    await t.click("[data-t=relive]");
    await t.sleep(4000);
    t.check("Relive plays", await t.eval(`[...document.querySelectorAll("video")].some((v) => !v.paused && v.currentTime > 0.3)`));
    await t.key("Escape");
    await t.sleep(800);
  } else t.check("Relive button", false);
  await t.click('[aria-label="Step 3: Multi-POV"]');
  t.check("step 3: approved POV pair", await until(`location.pathname === "/povs/${J.pov}"`));
  await t.sleep(2000);
  await t.key("v");
  await t.sleep(1000);
  t.check("side by side, no clipping in judge mode", (await t.eval(`document.querySelectorAll("video").length`)) >= 2 && !(await has("Clip both POVs")));
  await t.click('[aria-label="Step 4: Story Studio"]');
  t.check("step 4: approved split-screen story", await until(`location.pathname === "/studio" && location.search.includes("story=${J.story}")`));
  await t.sleep(3000);
  t.check("judge Studio has no Render MP4", !(await has("Render MP4")));
  t.check("split preview shown", await has("Side by side · aligned"));
  t.check("tour tip mentions the approved MP4", await has("Export shows the approved MP4"));
  await t.shot("r1-judge-studio");
  await tag(byText("Export", "button"), "export");
  await t.click("[data-t=export]");
  await t.sleep(1500);
  const vid = `document.querySelector('video[aria-label="Exported story video"]')`;
  t.check("approved export listed", await t.eval(`!!${vid} && ${vid}.src.includes("${J.exp}")`));
  await t.eval(`${vid}.muted = true, ${vid}.play(), 0`);
  await t.sleep(2500);
  t.check("approved export plays", await t.eval(`${vid}.currentTime > 1 && ${vid}.duration > 5 && ${vid}.duration < 6`), String(await t.eval(`${vid}.currentTime + " / " + ${vid}.duration`)));
  t.check("no delete control for the approved export", !(await t.eval(`!!${byText("Delete", "button")}`)));
  await t.shot("r2-judge-export");
  await t.key("Escape");

  t.step("recall");
  await t.goto(`${B}/recall?q=${encodeURIComponent("climbing a green jungle mountain")}&visual=1`, 4000);
  const lab = await t.eval(`[...document.querySelectorAll('ol[aria-label="Results"] > li')].map((li) => li.innerText.replace(/\\n/g, " | ")).slice(0, 3)`);
  t.check("scene results labelled approximate, never verified", lab.length > 0 && lab.every((l) => l.includes("approximate")) && !lab.some((l) => /verified/i.test(l)), lab[0]);
  t.check("experimental label present", await has("xperimental"));
  await t.goto(`${B}/recall?q=${encodeURIComponent(J.line)}`, 3500);
  t.check("speech Recall strong match", await has("Strong match"));

  t.step("navigation");
  for (const p of ["/", "/library", "/clips", "/sessions", "/povs", "/studio", "/status", "/recall/demo", "/sessions/demo", "/studio?demo=1"]) {
    await t.goto(`${B}${p}`, 1500);
    t.check(`${p} renders`, (await t.eval(`!!document.querySelector("main") && !document.body.innerText.includes("Application error")`)) && (await fits()));
  }

  if (process.env.ORDINARY_STORY) {
    t.step("ordinary export");
    const id = process.env.ORDINARY_STORY;
    await t.goto(`${B}/studio?story=${id}`, 3000);
    await tag(byText("Export", "button"), "ex2");
    await t.click("[data-t=ex2]");
    await t.sleep(800);
    t.check("Render available outside judge mode", await tag(byText("Render", "button"), "r2"));
    await t.click("[data-t=r2]");
    let e = null;
    for (let i = 0; i < 240; i++) {
      await t.sleep(1000);
      e = (await t.eval(`fetch("/api/stories/${id}").then((r) => r.json())`)).exports[0];
      if (e && (e.status === "done" || e.status === "failed")) break;
    }
    t.check("ordinary export renders with lock on", e?.status === "done", e?.id);
  }

  t.step("phone");
  await t.viewport(390, 844, true);
  await t.goto(`${B}/studio?story=${J.story}&judge=1`, 3000);
  t.check("judge Studio fits 390", await fits());
  await t.goto(`${B}/povs`, 2000);
  t.check("/povs fits 390", await fits());
}
