// Sets the game on recordings whose game was confirmed by hand, through the
// app's own API (PUT /api/recordings/:id/game), so the judge lock, the
// session pin and validation all apply. Dry run unless --apply.
// Usage: METAL_URL=http://127.0.0.1:3001 node scripts/release/assign-games.mjs [--apply]
const B = process.env.METAL_URL;
if (!B) throw new Error("Set METAL_URL");
const APPLY = process.argv.includes("--apply");

// Each identity was checked on frames of the recording itself (2026-10-25).
const GAMES = [
  { id: "rec_6520f3fcd3324fb8", title: "dGNmEv3 a-Ube0WFBkkNqA", game: "Valorant", evidence: "Valorant HUD: A Site, Spike Planted, agent kill feed" },
  { id: "rec_2a9084d48d7f4a4d", title: "CTnULlxyHo2bsbmKtRLlGg", game: "Valorant", evidence: "Valorant HUD: VANDAL loadout, Jett in kill feed, A Site" },
  { id: "rec_f0bd67b32fdc448e", title: "7ds8NbR52 kveYyUgNNTRw", game: "Overwatch 2", evidence: "Overwatch 2 HUD: STOP THE PAYLOAD, Cassidy, 250 HP" },
  { id: "rec_a5113821afb84bb5", title: "Gzbu5IIgufBKX4dcEd8gRQ", game: "League of Legends", evidence: "League of Legends ARAM: Howling Abyss minimap, 'Biggest Snowball Ever!'" },
];

const H = { "Content-Type": "application/json", "x-metal-action": "1" };
let failed = 0;
for (const g of GAMES) {
  const cur = await fetch(`${B}/api/recordings/${g.id}/game`).then(async (r) => ({ status: r.status, body: r.ok ? await r.json() : null }));
  if (cur.status !== 200) {
    console.log(`FAIL  ${g.id}  not found (${cur.status})`);
    failed++;
    continue;
  }
  if (cur.body.game === g.game) {
    console.log(`OK    ${g.id}  already ${g.game}`);
    continue;
  }
  if (cur.body.game !== null) {
    console.log(`SKIP  ${g.id}  has "${cur.body.game}" — not overwriting a game someone set`);
    failed++;
    continue;
  }
  if (!APPLY) {
    console.log(`PLAN  ${g.id}  ${g.title} → ${g.game}  (${g.evidence})`);
    continue;
  }
  const r = await fetch(`${B}/api/recordings/${g.id}/game`, { method: "PUT", headers: H, body: JSON.stringify({ game: g.game }) });
  const body = await r.json().catch(() => null);
  const ok = r.status === 200 && body?.game === g.game;
  if (!ok) failed++;
  console.log(`${ok ? "SET " : "FAIL"}  ${g.id}  ${g.title} → ${g.game}  [${r.status}${ok ? "" : ` ${JSON.stringify(body)}`}]`);
}
console.log(failed ? `\n${failed} problem(s)` : APPLY ? "\nAll set." : "\nDry run. Re-run with --apply during the maintenance window.");
process.exitCode = failed ? 1 : 0;
