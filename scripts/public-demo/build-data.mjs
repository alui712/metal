#!/usr/bin/env node
// Builds the data directory for METAL's public online demo from a local
// METAL data directory, keeping only the approved sample recordings.
//
//   node scripts/public-demo/build-data.mjs <source data dir> <output dir>
//
// The source is only read (SQLite online backup of a read-only handle). The
// output holds: a scrubbed copy of the database, those recordings' media and
// frames, the approved story export, the guided-demo config and the curated
// Recall tags. It refuses to finish if any absolute local path, local
// machine setting or other recording is left behind.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const [srcDir, outDir] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error("usage: build-data.mjs <source data dir> <output dir>");
  process.exit(2);
}

// Approved for the public demo: the guided demo's recordings (data/judge-demo.json).
const config = JSON.parse(fs.readFileSync(path.join(srcDir, "judge-demo.json"), "utf8"));
const KEEP = config.recordings.map((r) => (typeof r === "string" ? r : r.id));
const STORIES = [config.story];
const EXPORTS = config.exports ?? [];
const POVS = [config.pov];
if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) throw new Error(`${outDir} is not empty`);
fs.mkdirSync(outDir, { recursive: true });

const dbFile = path.join(outDir, "metal.db");
const src = new Database(path.join(srcDir, "metal.db"), { readonly: true, fileMustExist: true });
await src.backup(dbFile);
src.close();

const db = new Database(dbFile);
db.pragma("journal_mode = DELETE");
db.pragma("foreign_keys = ON");
const list = (ids) => ids.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(",");
const K = list(KEEP);

db.transaction(() => {
  // Local machine state: jobs, worker heartbeats, OBS, watched folders, settings.
  for (const t of ["jobs", "workers", "capture_state", "capture_commands", "folder_files", "watched_folders", "app_settings"]) db.exec(`DELETE FROM ${t}`);
  db.exec(`DELETE FROM exports WHERE id NOT IN (${list(EXPORTS)})`);
  db.exec(`DELETE FROM story_projects WHERE id NOT IN (${list(STORIES)})`);
  db.exec(`DELETE FROM pov_groups WHERE id NOT IN (${list(POVS)})`);
  db.exec(`DELETE FROM pov_matches WHERE recording_id NOT IN (${K}) OR candidate_id NOT IN (${K})`);
  db.exec(`DELETE FROM ai_outputs`);
  // Cascades remove the other recordings' transcripts, chunks, frames, clips and analysis.
  db.exec(`DELETE FROM recordings WHERE id NOT IN (${K})`);
  db.exec(`DELETE FROM sessions WHERE id NOT IN (SELECT session_id FROM recordings WHERE session_id IS NOT NULL) AND id NOT IN (SELECT source_session_id FROM story_projects WHERE source_session_id IS NOT NULL)`);
  // Where files came from on this computer is never part of the demo.
  db.exec(`UPDATE recordings SET source_path = NULL`);
  db.exec(`UPDATE exports SET job_id = NULL`);
})();
db.exec("VACUUM");

// --- checks: nothing outside the approved set, no local paths anywhere.
const fail = (m) => {
  throw new Error(`refusing to publish: ${m}`);
};
const recs = db.prepare("SELECT id FROM recordings ORDER BY id").pluck().all();
if (recs.length !== KEEP.length || recs.some((r) => !KEEP.includes(r))) fail(`recordings ${recs.join(",")}`);
if (db.pragma("integrity_check", { simple: true }) !== "ok") fail("integrity check");
if (db.pragma("foreign_key_check").length) fail("foreign keys");
for (const t of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'chunks_fts%'").pluck().all()) {
  const cols = db.prepare(`SELECT name FROM pragma_table_info('${t}') WHERE type LIKE '%TEXT%'`).pluck().all();
  for (const c of cols) {
    const hit = db.prepare(`SELECT ${c} FROM ${t} WHERE ${c} LIKE '%/Users/%' OR ${c} LIKE '%/private/%' OR ${c} LIKE '%/tmp/%' LIMIT 1`).pluck().get();
    if (hit) fail(`local path in ${t}.${c}: ${hit}`);
  }
  for (const c of db.prepare(`SELECT name FROM pragma_table_info('${t}') WHERE name LIKE '%recording_id%'`).pluck().all()) {
    const n = db.prepare(`SELECT count(*) FROM ${t} WHERE ${c} IS NOT NULL AND ${c} NOT IN (${K})`).pluck().get();
    if (n) fail(`${n} rows of ${t} point at other recordings`);
  }
}
const exportsLeft = db.prepare("SELECT id, output_path FROM exports").all();
db.close();

// --- files: only what the kept rows reference.
let bytes = 0;
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  bytes += fs.statSync(to).size;
};
for (const id of KEEP) {
  const dir = path.join(srcDir, "media", id);
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isFile()) copy(p, path.join(outDir, "media", id, f));
  }
}
for (const e of exportsLeft) copy(path.join(srcDir, "exports", `${e.id}.mp4`), path.join(outDir, "exports", `${e.id}.mp4`));
fs.writeFileSync(path.join(outDir, "judge-demo.json"), JSON.stringify(config, null, 2) + "\n");
const tags = path.join(path.dirname(new URL(import.meta.url).pathname), "../../docs/demo/recall-tags.json");
copy(tags, path.join(outDir, "recall-tags.json"));

console.log(`demo data: ${recs.length} recordings, ${exportsLeft.length} export(s), ${(bytes / 1e6).toFixed(1)} MB of files → ${outDir}`);
