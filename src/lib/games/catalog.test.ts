import { describe, expect, it } from "vitest";
import { canonicalGame, catalogGame, GAMES, GENRES, parseGameQuery } from "./catalog";

describe("game list (pure)", () => {
  it("finds genres, broad and specific", () => {
    expect(parseGameQuery("first person shooter")).toMatchObject({ genres: ["fps"], rest: "" });
    expect(parseGameQuery("First-Person Shooter")).toMatchObject({ genres: ["fps"], rest: "" });
    expect(parseGameQuery("FPS")).toMatchObject({ genres: ["fps"], rest: "" });
    expect(parseGameQuery("shooter game").genres.sort()).toEqual(["fps", "hero", "tactical", "tps"]);
    expect(parseGameQuery("clips of tactical shooters")).toMatchObject({ genres: ["tactical"], rest: "" });
  });
  it("finds game names and aliases; keeps the rest of the search", () => {
    expect(parseGameQuery("Valorant")).toMatchObject({ games: ["valorant"], genres: [], rest: "" });
    expect(parseGameQuery("valorant gameplay")).toMatchObject({ games: ["valorant"], rest: "" });
    expect(parseGameQuery("cs2 clutch")).toMatchObject({ games: ["counter strike 2"], rest: "clutch" });
    expect(parseGameQuery("first person shooter on a sunny sandstone street")).toMatchObject({ genres: ["fps"], rest: "sunny sandstone street" });
  });
  it("leaves scene searches alone", () => {
    for (const q of ["jungle cliff", "rocky cliff", "a dark hallway with a monster", "underwater", "snow", "Did that bug just die?"])
      expect(parseGameQuery(q)).toMatchObject({ genres: [], games: [] });
  });
  it("matches a common-word game name only on its own", () => {
    expect(parseGameQuery("PEAK").games).toEqual(["peak"]);
    expect(parseGameQuery("climbing to the mountain peak")).toMatchObject({ games: [], rest: "climbing to mountain peak" });
  });
  it("matches games set on recordings that aren't in the list, by name only", () => {
    expect(parseGameQuery("deep rock galactic", ["Deep Rock Galactic"]).games).toEqual(["deep rock galactic"]);
    expect(parseGameQuery("deep rock galactic").games).toEqual([]);
  });
  it("doesn’t treat other words as genres", () => {
    expect(parseGameQuery("farming game")).toMatchObject({ genres: [], games: [], rest: "farming" });
  });
  it("stores the list name for known games, the typed name otherwise", () => {
    expect(canonicalGame("  valorant ")).toBe("Valorant");
    expect(canonicalGame("csgo")).toBe("Counter-Strike 2");
    expect(canonicalGame("Deep  Rock Galactic")).toBe("Deep Rock Galactic");
    expect(canonicalGame("   ")).toBeNull();
    expect(catalogGame("Marvel Rivals")?.genres).not.toContain("fps");
  });
  it("list entries are well formed", () => {
    const names = GAMES.flatMap((g) => [g.name.toLowerCase(), ...g.aliases]);
    expect(new Set(names).size).toBe(names.length);
    for (const g of GAMES) for (const k of g.genres) expect(GENRES[k]).toBeDefined();
  });
});
