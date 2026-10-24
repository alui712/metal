// DEMO FIXTURES — fictional games, players, and sessions used to build and
// demonstrate the UI before real ingestion exists. Nothing here is derived
// from real recordings; every surface that shows it is labeled "Demo".

import type {
  Game,
  Moment,
  MomentKind,
  Recording,
  Session,
} from "../contracts";

export const games: Game[] = [
  { id: "gridlock", name: "Gridlock Arena", genre: "Tactical shooter", art: { variant: "arena", hue: 168, seed: 11 } },
  { id: "ashfall", name: "Ashfall", genre: "Battle royale", art: { variant: "ridge", hue: 18, seed: 23 } },
  { id: "hollow-peak", name: "Hollow Peak", genre: "Co-op survival", art: { variant: "peaks", hue: 205, seed: 37 } },
  { id: "neon-drift", name: "Neon Drift", genre: "Street racing", art: { variant: "city", hue: 312, seed: 41 } },
  { id: "starward", name: "Starward", genre: "Space tactics", art: { variant: "orbit", hue: 190, seed: 53 } },
];

const MIN = 60_000;
const SEC = 1000;

/** Fixture times are wall-clock UTC; format them with timeZone "UTC". */
const at = (iso: string) => Date.parse(`${iso}Z`);

type MomentSeed = {
  at: number; // seconds from recording start
  len: number; // seconds
  kind: MomentKind;
  title: string;
  caption: string;
  lines: Array<[number, string, string]>; // [seconds offset within moment, speaker, text]
  tags: string[];
  score: number;
  peak?: number;
};

type RecordingSeed = {
  id: string;
  title: string;
  owner: string;
  start: string;
  minutes: number;
  seed: number;
  moments: MomentSeed[];
};

type SessionSeed = {
  id: string;
  title: string;
  summary: string;
  gameId: string;
  friends: string[];
  cover: string; // moment id
  recordings: RecordingSeed[];
};

const sessionSeeds: SessionSeed[] = [
  {
    id: "ses_sector7",
    title: "The Comeback at Sector 7",
    summary:
      "Down 3–11 at the half, the squad switched to a slow default and clawed back round by round. Mira's 1v3 retake on round 22 forced overtime, and Kai closed it out with a jump-spot nobody saw coming.",
    gameId: "gridlock",
    friends: ["Kai", "Mira", "Dex"],
    cover: "mom_s7_clutch",
    recordings: [
      {
        id: "rec_s7_a",
        title: "Sector 7 — first half",
        owner: "You",
        start: "2026-10-16T21:12:00",
        minutes: 38,
        seed: 101,
        moments: [
          { at: 214, len: 14, kind: "fail", title: "Rushed B, regretted it", caption: "Four players sprint through a narrow corridor into a smoke; the kill feed fills with red.", lines: [[2, "Dex", "Go go go, B is empty!"], [9, "Mira", "It was not empty."]], tags: ["rush", "b site", "wipe"], score: 0.48, peak: 0.71 },
          { at: 1104, len: 18, kind: "funny", title: "Kai's flashbang strikes again", caption: "The screen whites out as a flashbang bounces off a door frame back toward the team.", lines: [[3, "Kai", "Flash out— oh no."], [8, "Mira", "Kai, I can't see anything!"], [13, "Dex", "That's three rounds in a row"]], tags: ["flashbang", "teamflash", "laughing"], score: 0.62, peak: 0.84 },
          { at: 1890, len: 12, kind: "reaction", title: "Halftime: 3–11", caption: "Scoreboard overlay shows 3 to 11 at halftime; the team stands in spawn.", lines: [[1, "You", "Okay. Slow default. Nobody peeks alone."], [7, "Mira", "We can still do this."]], tags: ["halftime", "scoreboard", "strategy"], score: 0.55 },
        ],
      },
      {
        id: "rec_s7_b",
        title: "Sector 7 — the comeback",
        owner: "You",
        start: "2026-10-16T21:54:00",
        minutes: 44,
        seed: 102,
        moments: [
          { at: 412, len: 16, kind: "highlight", title: "Ace on eco round", caption: "Pistol-only round: five eliminations in quick succession across mid and A ramp.", lines: [[4, "You", "One… two…"], [11, "Kai", "NO WAY, that's an ace!"]], tags: ["ace", "eco", "pistol"], score: 0.86, peak: 0.93 },
          { at: 1580, len: 22, kind: "clutch", title: "Mira's 1v3 retake", caption: "Mira, last alive, defuses with 0.4 seconds left after a triple elimination on A site.", lines: [[3, "Mira", "I've got this. Nobody talk."], [15, "Dex", "Defuse defuse defuse—"], [20, "Kai", "SHE DID IT!"]], tags: ["clutch", "1v3", "defuse", "overtime"], score: 0.97, peak: 0.98 },
          { at: 2410, len: 15, kind: "reaction", title: "Overtime huddle", caption: "Team gathers at spawn as the overtime banner appears; score tied 12–12.", lines: [[2, "Dex", "Overtime. I'm shaking."], [9, "You", "Same plan. Trust it."]], tags: ["overtime", "tied"], score: 0.58 },
        ],
      },
      {
        id: "rec_s7_c",
        title: "Sector 7 — overtime (Kai's POV)",
        owner: "Kai",
        start: "2026-10-16T22:41:00",
        minutes: 27,
        seed: 103,
        moments: [
          { at: 640, len: 14, kind: "highlight", title: "The jump-spot", caption: "Kai lands on a ledge above B site and takes two opponents by surprise.", lines: [[5, "Kai", "They never check up here."], [10, "Mira", "Since when can you stand there?!"]], tags: ["jump spot", "off-angle", "b site"], score: 0.8, peak: 0.77 },
          { at: 1480, len: 20, kind: "victory", title: "We actually won", caption: "Victory screen: 14–12. All four players' cameras show celebration emotes.", lines: [[1, "Dex", "WE WON!"], [6, "Mira", "From 3–11! Somebody clip that!"], [12, "You", "Already clipped."]], tags: ["victory", "comeback", "celebration"], score: 0.95, peak: 0.99 },
        ],
      },
    ],
  },
  {
    id: "ses_lastones",
    title: "Last Ones Standing",
    summary:
      "Three drops into the ash storm. The final game came down to a two-versus-one in the collapsing zone, won with a single grenade and a lot of shouting.",
    gameId: "ashfall",
    friends: ["Juno", "Dex"],
    cover: "mom_lo_final",
    recordings: [
      {
        id: "rec_lo_a",
        title: "Ashfall — drops 1 & 2",
        owner: "You",
        start: "2026-10-10T20:31:00",
        minutes: 41,
        seed: 201,
        moments: [
          { at: 95, len: 12, kind: "funny", title: "Landed on the wrong roof", caption: "Glider overshoots the marked building and lands on a crane above the drop zone.", lines: [[2, "Juno", "Where are you going?"], [8, "You", "The wind took me."]], tags: ["drop", "glider", "laughing"], score: 0.5, peak: 0.66 },
          { at: 1720, len: 16, kind: "fail", title: "Storm ate our loot", caption: "Inventory screen open as the ash storm wall passes over the team; health bars draining.", lines: [[3, "Dex", "Just one more crate."], [11, "Juno", "Dex, the storm!"]], tags: ["storm", "loot", "greedy"], score: 0.44, peak: 0.6 },
        ],
      },
      {
        id: "rec_lo_b",
        title: "Ashfall — the final drop",
        owner: "You",
        start: "2026-10-10T21:20:00",
        minutes: 36,
        seed: 202,
        moments: [
          { at: 880, len: 14, kind: "highlight", title: "Sniper across the canyon", caption: "Long-range shot across a burning canyon; hit marker and knock notification.", lines: [[4, "Juno", "Knocked one, 300 meters!"]], tags: ["sniper", "long shot", "canyon"], score: 0.74, peak: 0.72 },
          { at: 1930, len: 24, kind: "clutch", title: "Two versus one in the final circle", caption: "Final zone the size of a house; you and Juno against one opponent behind a rock.", lines: [[2, "You", "He's behind the rock, I'll nade."], [14, "Juno", "Go now!"], [20, "Dex", "(spectating) THAT'S IT!"]], tags: ["final circle", "grenade", "2v1"], score: 0.93, peak: 0.96 },
          { at: 2050, len: 12, kind: "victory", title: "Last ones standing", caption: "Victory banner over a smoking crater; squad placement 1st of 60.", lines: [[1, "Juno", "WE'RE THE LAST ONES!"], [6, "Dex", "Dead for ten minutes and I still won."]], tags: ["victory", "first place", "celebration"], score: 0.9, peak: 0.97 },
        ],
      },
      {
        id: "rec_lo_c",
        title: "Ashfall — Juno's POV",
        owner: "Juno",
        start: "2026-10-10T21:21:00",
        minutes: 34,
        seed: 203,
        moments: [
          { at: 1940, len: 18, kind: "reaction", title: "Juno's view of the grenade", caption: "From Juno's angle the grenade arcs over the rock and the last opponent is eliminated.", lines: [[6, "Juno", "Perfect throw!"], [12, "You", "I can't believe that landed."]], tags: ["grenade", "final circle", "pov"], score: 0.82, peak: 0.95 },
        ],
      },
    ],
  },
  {
    id: "ses_whiteout",
    title: "Whiteout",
    summary:
      "A blizzard night on the north face. The crew lost the supply sled, built a shelter in the dark, and summited at dawn with one flare left.",
    gameId: "hollow-peak",
    friends: ["Mira", "Juno"],
    cover: "mom_wo_summit",
    recordings: [
      {
        id: "rec_wo_a",
        title: "Hollow Peak — the climb",
        owner: "You",
        start: "2026-10-04T19:02:00",
        minutes: 52,
        seed: 301,
        moments: [
          { at: 700, len: 18, kind: "fail", title: "There goes the sled", caption: "Supply sled slides off an icy ledge and disappears into the fog below.", lines: [[3, "Mira", "Who was holding the sled?"], [10, "Juno", "…the sled was holding itself."]], tags: ["sled", "ice", "laughing"], score: 0.66, peak: 0.8 },
          { at: 2300, len: 20, kind: "highlight", title: "Shelter before the storm", caption: "Three players finish a snow shelter as the storm meter hits maximum.", lines: [[5, "You", "Door's in, get inside!"], [14, "Mira", "Cozy. Terrifying, but cozy."]], tags: ["shelter", "blizzard", "teamwork"], score: 0.71, peak: 0.55 },
        ],
      },
      {
        id: "rec_wo_b",
        title: "Hollow Peak — summit at dawn",
        owner: "You",
        start: "2026-10-04T20:20:00",
        minutes: 46,
        seed: 302,
        moments: [
          { at: 1210, len: 14, kind: "reaction", title: "Wolves in the dark", caption: "Flashlight beam catches several pairs of eyes at the tree line.", lines: [[2, "Juno", "Do you see the eyes?"], [8, "Mira", "Nope. Nope nope nope."]], tags: ["wolves", "scared", "night"], score: 0.6, peak: 0.88 },
          { at: 2580, len: 22, kind: "victory", title: "Summit at dawn", caption: "Sunrise breaks over the summit as the last flare goes up; achievement unlocked.", lines: [[4, "Mira", "Look at that sunrise."], [12, "You", "One flare left. Worth it."], [18, "Juno", "Screenshot. Everyone stand still."]], tags: ["summit", "sunrise", "achievement"], score: 0.92, peak: 0.62 },
        ],
      },
      {
        id: "rec_wo_c",
        title: "Hollow Peak — Mira's POV",
        owner: "Mira",
        start: "2026-10-04T20:22:00",
        minutes: 43,
        seed: 303,
        moments: [
          { at: 2490, len: 16, kind: "highlight", title: "The last flare", caption: "Mira lights the final flare at the summit cairn; red light floods the snow.", lines: [[3, "Mira", "Lighting it now."], [10, "You", "That's the shot."]], tags: ["flare", "summit", "pov"], score: 0.78, peak: 0.5 },
        ],
      },
    ],
  },
  {
    id: "ses_midnight",
    title: "Midnight Run",
    summary:
      "Street races through the harbor district. A photo finish, a spectacular crash into the fish market, and a new personal best on the Skyline loop.",
    gameId: "neon-drift",
    friends: ["Kai"],
    cover: "mom_mr_photo",
    recordings: [
      {
        id: "rec_mr_a",
        title: "Neon Drift — harbor circuit",
        owner: "You",
        start: "2026-09-26T22:05:00",
        minutes: 48,
        seed: 401,
        moments: [
          { at: 520, len: 12, kind: "fail", title: "Into the fish market", caption: "Car clips a barrier and spins through market stalls; crates everywhere.", lines: [[3, "Kai", "Not the fish market!"], [8, "You", "I'm fine. The fish are not."]], tags: ["crash", "spinout", "laughing"], score: 0.64, peak: 0.86 },
          { at: 1780, len: 16, kind: "clutch", title: "Photo finish", caption: "Two cars cross the line side by side; replay shows a 0.02 second gap.", lines: [[5, "Kai", "Who won? WHO WON?"], [12, "You", "Point zero two. Me."]], tags: ["photo finish", "race", "close"], score: 0.91, peak: 0.94 },
        ],
      },
      {
        id: "rec_mr_b",
        title: "Neon Drift — skyline loop",
        owner: "You",
        start: "2026-09-26T23:10:00",
        minutes: 31,
        seed: 402,
        moments: [
          { at: 1340, len: 18, kind: "highlight", title: "New personal best", caption: "Lap timer turns gold: 1:42.318 on the Skyline loop, a new personal best.", lines: [[4, "You", "Clean line through the tunnel…"], [14, "Kai", "1:42! That's a PB!"]], tags: ["personal best", "lap", "drift"], score: 0.84, peak: 0.7 },
        ],
      },
    ],
  },
  {
    id: "ses_firstcontact",
    title: "First Contact",
    summary:
      "The campaign opener. A cautious first jump, a misread sensor ping, and an ambush that turned into the crew's first fleet victory.",
    gameId: "starward",
    friends: ["Dex", "Juno"],
    cover: "mom_fc_fleet",
    recordings: [
      {
        id: "rec_fc_a",
        title: "Starward — campaign opener",
        owner: "You",
        start: "2026-09-19T18:47:00",
        minutes: 57,
        seed: 501,
        moments: [
          { at: 940, len: 14, kind: "funny", title: "It was an asteroid", caption: "Tactical map highlights an 'enemy' contact that resolves into a slowly tumbling asteroid.", lines: [[2, "Dex", "Contact bearing two-one-zero!"], [9, "Juno", "That's a rock, Dex."]], tags: ["asteroid", "sensor", "laughing"], score: 0.58, peak: 0.6 },
          { at: 2700, len: 20, kind: "clutch", title: "Ambush at the gate", caption: "Enemy fleet drops out of the jump gate; the flagship's shields fall to 4%.", lines: [[3, "You", "Shields to front, everything to front!"], [13, "Juno", "Four percent… holding!"]], tags: ["ambush", "shields", "fleet"], score: 0.88, peak: 0.9 },
        ],
      },
      {
        id: "rec_fc_b",
        title: "Starward — first fleet victory",
        owner: "You",
        start: "2026-09-19T19:50:00",
        minutes: 39,
        seed: 502,
        moments: [
          { at: 1500, len: 18, kind: "victory", title: "First fleet victory", caption: "Enemy flagship breaks apart against a nebula; 'Victory' displayed in the fleet log.", lines: [[4, "Dex", "Flagship's down!"], [11, "Juno", "First win of the campaign!"]], tags: ["victory", "flagship", "nebula"], score: 0.9, peak: 0.92 },
        ],
      },
    ],
  },
];

// Stable moment ids for covers and deep links; others derive from position.
const momentIdOverrides: Record<string, string> = {
  "rec_s7_b:1": "mom_s7_clutch",
  "rec_lo_b:1": "mom_lo_final",
  "rec_wo_b:1": "mom_wo_summit",
  "rec_mr_a:1": "mom_mr_photo",
  "rec_fc_b:0": "mom_fc_fleet",
};

const gameById = new Map(games.map((g) => [g.id, g]));

export const recordings: Recording[] = [];
export const moments: Moment[] = [];
export const sessions: Session[] = [];

for (const s of sessionSeeds) {
  const game = gameById.get(s.gameId)!;
  const recs = s.recordings.map((r): Recording => ({
    id: r.id,
    title: r.title,
    gameId: s.gameId,
    sessionId: s.id,
    ownerLabel: r.owner,
    recordedAt: at(r.start),
    durationMs: r.minutes * MIN,
    width: 1920,
    height: 1080,
    fps: 60,
    // ~12 Mbit/s H.264
    sizeBytes: Math.round(r.minutes * 60 * 1.5e6),
    container: "MP4 · H.264",
    art: { ...game.art, seed: r.seed },
    media: { kind: "demo" },
    source: "demo",
  }));
  recordings.push(...recs);

  for (const r of s.recordings) {
    r.moments.forEach((m, i) => {
      const startMs = m.at * SEC;
      moments.push({
        id: momentIdOverrides[`${r.id}:${i}`] ?? `mom_${r.id.slice(4)}_${i}`,
        recordingId: r.id,
        startMs,
        endMs: startMs + m.len * SEC,
        title: m.title,
        kind: m.kind,
        score: m.score,
        caption: m.caption,
        transcript: m.lines.map(([t, speaker, text]) => ({
          tMs: startMs + t * SEC,
          speaker,
          text,
        })),
        audioPeak: m.peak ?? null,
        tags: m.tags,
      });
    });
  }

  sessions.push({
    id: s.id,
    title: s.title,
    summary: s.summary,
    gameId: s.gameId,
    startedAt: Math.min(...recs.map((r) => r.recordedAt)),
    endedAt: Math.max(...recs.map((r) => r.recordedAt + r.durationMs)),
    friends: s.friends,
    recordingIds: recs.map((r) => r.id),
    coverMomentId: s.cover,
    art: { ...game.art, seed: game.art.seed * 7 },
    source: "demo",
  });
}

sessions.sort((a, b) => b.startedAt - a.startedAt);
recordings.sort((a, b) => b.recordedAt - a.recordedAt);
