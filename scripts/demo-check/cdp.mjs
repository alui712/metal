// Minimal Chrome DevTools Protocol driver for the demo check (no dependencies).
// Usage: npm run demo:check   (needs the app on METAL_URL, the worker, and Google Chrome)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Screenshots and the throwaway browser profile live in gitignored data/.
const OUT = path.resolve(process.env.METAL_DATA_DIR ?? "data", "demo-check");
const PORT = 9333;

const chrome = spawn(CHROME, [
  "--headless=new", "--mute-audio", `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}/profile`,
  "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--force-device-scale-factor=1", "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(url, method = "GET") {
  for (let i = 0; i < 50; i++) {
    try { return await (await fetch(url, { method })).json(); } catch { await sleep(200); }
  }
  throw new Error("Chrome did not start");
}

const target = await json(`http://127.0.0.1:${PORT}/json/new?about:blank`, "PUT");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const listeners = [];
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method) listeners.forEach((l) => l(msg));
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const problems = [];
let currentStep = "";
listeners.push((m) => {
  if (m.method === "Runtime.exceptionThrown") problems.push(`[${currentStep}] EXCEPTION ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning", "assert"].includes(m.params.type))
    problems.push(`[${currentStep}] console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 6000)}`);
  if (m.method === "Log.entryAdded" && ["error", "warning"].includes(m.params.entry.level))
    problems.push(`[${currentStep}] log.${m.params.entry.level}: ${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 400));
});
await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");

export const api = {
  async viewport(w, h, mobile = false) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  },
  async reducedMotion(on) {
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }] });
  },
  async goto(url, settle = 1500) {
    currentStep = url;
    const loaded = new Promise((r) => { const l = (m) => { if (m.method === "Page.loadEventFired") { listeners.splice(listeners.indexOf(l), 1); r(); } }; listeners.push(l); });
    await send("Page.navigate", { url });
    await loaded;
    await sleep(settle);
  },
  async eval(expr) {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n${expr}`);
    return r.result.value;
  },
  async key(key, { code, modifiers = 0, text } = {}) {
    const vk = { Enter: 13, Escape: 27, ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, ArrowUp: 38, Delete: 46, " ": 32, Tab: 9 }[key] ?? key.toUpperCase().charCodeAt(0);
    for (const type of ["keyDown", "keyUp"])
      await send("Input.dispatchKeyEvent", { type, key, code: code ?? (key.length === 1 ? `Key${key.toUpperCase()}` : key), windowsVirtualKeyCode: vk, modifiers, text: type === "keyDown" ? text : undefined });
  },
  async click(selector) {
    const box = await api.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({block:"center"}); const r = el.getBoundingClientRect(); return {x: r.x + r.width/2, y: r.y + r.height/2}; })()`);
    if (!box) throw new Error(`No element for ${selector}`);
    await sleep(150);
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  },
  async type(text) { await send("Input.insertText", { text }); },
  async shot(name, full = false) {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: full });
    fs.writeFileSync(path.join(OUT, "shots", `${name}.png`), Buffer.from(r.data, "base64"));
  },
  sleep,
  send,
  step(name) { currentStep = name; },
};

fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
const results = [];
api.check = (name, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
try {
  const scenario = await import(path.resolve(process.argv[2]));
  await scenario.default(api);
} catch (e) {
  results.push(`FAIL  scenario crashed — ${e.message}`);
} finally {
  console.log(results.join("\n"));
  console.log(problems.length ? `\nBrowser problems (${problems.length}):\n${[...new Set(problems)].join("\n")}` : "\nNo browser errors or warnings.");
  ws.close();
  chrome.kill();
}
