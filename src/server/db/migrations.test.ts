import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "./client";

// Upgrade paths into 0012_visual_index (ADR 0022). Older states are rebuilt from the real migration files, then
// opened with openDb() exactly as the app does.
const DIR = path.join(process.cwd(), "drizzle");
type Entry = { idx: number; version: string; when: number; tag: string; breakpoints: boolean };
const journal = (JSON.parse(fs.readFileSync(path.join(DIR, "meta/_journal.json"), "utf8")) as { entries: Entry[] }).entries;
// feat/visual-recall shipped the same tables as 0011_visual_index, journalled *before* 0011_split_clips.
const LEGACY_VISUAL: Entry = { idx: 11, version: "6", when: 1792898348738, tag: "0011_visual_index", breakpoints: true };
const legacySql = () => fs.readFileSync(path.join(DIR, "0012_visual_index.sql"), "utf8").replaceAll(" IF NOT EXISTS", "");

const tmp: string[] = [];
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A database migrated only through `entries` (plus optional extra SQL files), as an older build would leave it. */
function olderDb(entries: Entry[], extra: Record<string, string> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "metal-mig-"));
  tmp.push(root);
  const mig = path.join(root, "drizzle");
  fs.mkdirSync(path.join(mig, "meta"), { recursive: true });
  for (const e of entries) fs.writeFileSync(path.join(mig, `${e.tag}.sql`), extra[e.tag] ?? fs.readFileSync(path.join(DIR, `${e.tag}.sql`)));
  fs.writeFileSync(path.join(mig, "meta/_journal.json"), JSON.stringify({ version: "7", dialect: "sqlite", entries }));
  const file = path.join(root, "metal.db");
  const sqlite = new Database(file);
  migrate(drizzle(sqlite), { migrationsFolder: mig });
  return { file, sqlite };
}

/** Inserts a row, filling required columns that this schema version has without defaults. */
function insert(sqlite: Database.Database, table: string, values: Record<string, unknown>) {
  const cols = sqlite.pragma(`table_info(${table})`) as Array<{ name: string; type: string; notnull: number; dflt_value: unknown; pk: number }>;
  const row = { ...values };
  for (const c of cols) if (c.notnull && c.dflt_value === null && !(c.name in row)) row[c.name] = /INT/i.test(c.type) ? 0 : /BLOB/i.test(c.type) ? Buffer.alloc(8) : "x";
  const keys = Object.keys(row);
  sqlite.prepare(`INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...keys.map((k) => row[k]));
}

const tables = (sqlite: Database.Database) => (sqlite.prepare("select name from sqlite_master where type in ('table','index') and name not like 'sqlite_%' order by name").all() as Array<{ name: string }>).map((r) => r.name);
const applied = (sqlite: Database.Database) => (sqlite.prepare("select created_at from __drizzle_migrations order by id").all() as Array<{ created_at: number }>).map((r) => Number(r.created_at));
const cols = (sqlite: Database.Database, t: string) => (sqlite.pragma(`table_info(${t})`) as Array<{ name: string }>).map((c) => c.name);
const REC = "rec_0000000000000001";

function reopenAndCheck(file: string) {
  const db = openDb(file);
  const s = db.$client;
  expect(s.pragma("integrity_check", { simple: true })).toBe("ok");
  expect(s.pragma("foreign_key_check")).toEqual([]);
  expect(cols(s, "story_clips")).toEqual(expect.arrayContaining(["layout", "secondary_recording_id", "secondary_in_ms"]));
  expect(tables(s)).toEqual(expect.arrayContaining(["recording_visual_index", "visual_frames", "visual_frames_recording_t_idx"]));
  // Every migration in this build is recorded.
  expect(applied(s)).toEqual(expect.arrayContaining(journal.map((e) => e.when)));
  const before = { tables: tables(s), applied: applied(s) };
  s.close();
  // Re-opening is a no-op.
  const again = openDb(file).$client;
  expect({ tables: tables(again), applied: applied(again) }).toEqual(before);
  return again;
}

describe("migrations", () => {
  it("journal 'when' values strictly increase, so Drizzle never skips a migration", () => {
    for (let i = 1; i < journal.length; i++) expect(journal[i].when).toBeGreaterThan(journal[i - 1].when);
    expect(journal.at(-1)!.tag).toBe("0012_visual_index");
    // Newer than the legacy visual migration, so databases that ran it still get 0011_split_clips and 0012.
    expect(journal.find((e) => e.tag === "0011_split_clips")!.when).toBeGreaterThan(LEGACY_VISUAL.when);
  });

  it("fresh database: every migration, split columns and visual tables", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "metal-mig-"));
    tmp.push(root);
    const s = reopenAndCheck(path.join(root, "metal.db"));
    expect(applied(s)).toHaveLength(journal.length);
    s.close();
  });

  it("production-style database at 0010: upgrades and keeps data", () => {
    const { file, sqlite } = olderDb(journal.filter((e) => e.idx <= 10));
    insert(sqlite, "recordings", { id: REC, title: "peak pov", original_path: `${REC}/original.mp4`, original_filename: "peak pov.mp4", status: "ready" });
    insert(sqlite, "story_projects", { id: "sty_1", title: "A story" });
    insert(sqlite, "story_clips", { id: "stc_1", project_id: "sty_1", recording_id: REC, position: 0, in_ms: 0, out_ms: 3000 });
    sqlite.close();
    const s = reopenAndCheck(file);
    expect(s.prepare("select title from recordings").all()).toEqual([{ title: "peak pov" }]);
    expect(s.prepare("select layout, secondary_recording_id from story_clips").all()).toEqual([{ layout: "single", secondary_recording_id: null }]);
    expect(s.prepare("select count(*) n from visual_frames").get()).toEqual({ n: 0 });
    s.close();
  });

  it("integration database at 0011_split_clips: adds the visual tables only", () => {
    const { file, sqlite } = olderDb(journal.filter((e) => e.idx <= 11));
    insert(sqlite, "recordings", { id: REC, title: "peak pov", original_path: "a", original_filename: "a.mp4" });
    sqlite.close();
    const s = reopenAndCheck(file);
    expect(applied(s)).toHaveLength(journal.length);
    s.close();
  });

  it("database that ran feat/visual-recall's old 0011_visual_index: keeps its index, no duplicate tables", () => {
    const { file, sqlite } = olderDb([...journal.filter((e) => e.idx <= 10), LEGACY_VISUAL], { "0011_visual_index": legacySql() });
    insert(sqlite, "recordings", { id: REC, title: "peak pov", original_path: "a", original_filename: "a.mp4" });
    insert(sqlite, "recording_visual_index", { recording_id: REC, status: "done", version: "v1", model: "clip", frame_count: 1, requested_at: 1 });
    insert(sqlite, "visual_frames", { id: "vf_1", recording_id: REC, t_ms: 2000, path: "visual/x.jpg", model: "clip", embedding: Buffer.alloc(2048) });
    const legacyTables = tables(sqlite);
    sqlite.close();
    const s = reopenAndCheck(file);
    // Same visual tables as before (nothing duplicated or recreated), rows intact, both new migrations recorded.
    expect(tables(s).filter((t) => t.includes("visual"))).toEqual(legacyTables.filter((t) => t.includes("visual")));
    expect(s.prepare("select id, t_ms, length(embedding) n from visual_frames").all()).toEqual([{ id: "vf_1", t_ms: 2000, n: 2048 }]);
    expect(s.prepare("select status, frame_count from recording_visual_index").all()).toEqual([{ status: "done", frame_count: 1 }]);
    expect(applied(s)).toEqual(expect.arrayContaining([LEGACY_VISUAL.when]));
    expect(applied(s)).toHaveLength(journal.length + 1);
    s.close();
  });
});
