// METAL's game list: confirmed game identities → their genres, and the words
// people use for both. Recall matches a recording by game only through the
// game a person set on it (recordings.game); a genre comes from this list,
// never from what the video looks like. Pure: shared by the server and the UI.
//
// To add a game: its common names (lower case) and only genres that are
// undisputed for the whole game. Leave `genres` empty when unsure.

export type Genre = "fps" | "tps" | "tactical" | "hero" | "battle-royale" | "moba" | "horror";

export const GENRES: Record<Genre, { label: string; aliases: string[] }> = {
  fps: { label: "first-person shooter", aliases: ["first person shooter", "first person shooters", "fps", "fps game", "fps games"] },
  tps: { label: "third-person shooter", aliases: ["third person shooter", "third person shooters"] },
  tactical: { label: "tactical shooter", aliases: ["tactical shooter", "tactical shooters"] },
  hero: { label: "hero shooter", aliases: ["hero shooter", "hero shooters"] },
  "battle-royale": { label: "battle royale", aliases: ["battle royale", "battle royales"] },
  moba: { label: "MOBA", aliases: ["moba", "mobas", "multiplayer online battle arena"] },
  horror: { label: "horror game", aliases: ["horror game", "horror games"] },
};

/** Broad words that mean "any of these genres". */
export const GENRE_GROUPS: Array<{ label: string; aliases: string[]; genres: Genre[] }> = [
  { label: "shooter", aliases: ["shooter", "shooters", "shooter game", "shooter games", "shooting game", "shooting games"], genres: ["fps", "tps", "tactical", "hero"] },
];

export type CatalogGame = {
  name: string;
  /** Other names, lower case. The name itself always counts. */
  aliases: string[];
  genres: Genre[];
  /** The name is also an everyday word ("peak"): it matches only when the search is just the game's name. */
  commonWord?: boolean;
};

export const GAMES: CatalogGame[] = [
  { name: "Valorant", aliases: [], genres: ["fps", "tactical"] },
  { name: "Counter-Strike 2", aliases: ["counter strike 2", "counter strike", "cs2", "csgo", "cs go"], genres: ["fps", "tactical"] },
  { name: "Rainbow Six Siege", aliases: ["rainbow six", "rainbow 6 siege", "r6 siege"], genres: ["fps", "tactical"] },
  { name: "Overwatch 2", aliases: ["overwatch"], genres: ["fps", "hero"] },
  { name: "Apex Legends", aliases: ["apex"], genres: ["fps", "hero", "battle-royale"] },
  { name: "Call of Duty", aliases: ["cod", "warzone"], genres: ["fps"] },
  { name: "Team Fortress 2", aliases: ["tf2"], genres: ["fps", "hero"] },
  { name: "Destiny 2", aliases: ["destiny"], genres: ["fps"] },
  { name: "Fortnite", aliases: [], genres: ["tps", "battle-royale"] },
  { name: "PUBG: Battlegrounds", aliases: ["pubg"], genres: ["battle-royale"] },
  { name: "Marvel Rivals", aliases: [], genres: ["tps", "hero"] },
  { name: "League of Legends", aliases: [], genres: ["moba"] },
  { name: "Dota 2", aliases: ["dota"], genres: ["moba"] },
  { name: "Phasmophobia", aliases: ["phasmo"], genres: ["horror"] },
  { name: "Lethal Company", aliases: [], genres: ["horror"] },
  { name: "PEAK", aliases: [], genres: [], commonWord: true },
  { name: "Roblox", aliases: [], genres: [] },
  { name: "Minecraft", aliases: [], genres: [] },
];

/** Lower case, hyphens and punctuation as spaces, single spaces. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const namesOf = (g: CatalogGame) => [normalize(g.name), ...g.aliases.map(normalize)];

/** The catalog entry for a stored game name ("valorant", "CS2" → their entries), if it's a known game. */
export function catalogGame(name: string | null | undefined): CatalogGame | null {
  if (!name) return null;
  const n = normalize(name);
  return GAMES.find((g) => namesOf(g).includes(n)) ?? null;
}

/** Stored form of a game typed by a person: the catalog name when known, otherwise their text, trimmed. */
export function canonicalGame(input: string): string | null {
  const t = input.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!t) return null;
  return catalogGame(t)?.name ?? t;
}

/** Words that don't change what a game search asks for ("Valorant gameplay", "clips of shooter games"). */
const FILLER = new Set("a an the my our of in on from with game games gameplay clip clips recording recordings match matches video videos footage moments moment show find me all some".split(" "));

export type GameQuery = {
  /** Genres asked for, by key. */
  genres: Genre[];
  /** What the person typed for them ("first person shooter"), for honest wording. */
  genreWords: string[];
  /** Game names asked for, normalized (catalog names and aliases, or a stored free-text game). */
  games: string[];
  /** The rest of the search once game and genre words (and filler) are taken out. */
  rest: string;
};

/**
 * Pure: finds game names and genre words in a search. `knownGames` are the
 * games set on recordings, so a game outside the catalog still matches by name.
 */
export function parseGameQuery(q: string, knownGames: string[] = []): GameQuery {
  let text = ` ${normalize(q)} `;
  const out: GameQuery = { genres: [], genreWords: [], games: [], rest: "" };
  const take = (phrase: string) => {
    const p = ` ${phrase} `;
    if (!phrase || !text.includes(p)) return false;
    text = text.replace(p, " ");
    return true;
  };
  const whole = normalize(q).split(" ").filter((w) => !FILLER.has(w)).join(" ");
  type Entry = { phrase: string; ok?: boolean; on: () => void };
  const entries: Entry[] = [];
  for (const g of GAMES) for (const n of namesOf(g)) entries.push({ phrase: n, ok: !g.commonWord || whole === n, on: () => out.games.push(normalize(g.name)) });
  for (const k of knownGames) if (!catalogGame(k)) entries.push({ phrase: normalize(k), on: () => out.games.push(normalize(k)) });
  for (const [key, g] of Object.entries(GENRES) as Array<[Genre, (typeof GENRES)[Genre]]>)
    for (const a of g.aliases) entries.push({ phrase: a, on: () => (out.genres.push(key), out.genreWords.push(a)) });
  for (const grp of GENRE_GROUPS) for (const a of grp.aliases) entries.push({ phrase: a, on: () => (out.genres.push(...grp.genres), out.genreWords.push(a)) });
  // Longest first, so "first person shooter" wins over "shooter".
  entries.sort((a, b) => b.phrase.length - a.phrase.length);
  for (const e of entries) if (e.ok !== false && take(e.phrase)) e.on();
  out.genres = [...new Set(out.genres)];
  out.games = [...new Set(out.games)];
  out.rest = text.split(" ").filter((w) => w && !FILLER.has(w)).join(" ");
  return out;
}

/** Human list of genre labels: "first-person shooter, tactical shooter". */
export const genreLabels = (genres: Genre[]) => genres.map((g) => GENRES[g].label);
