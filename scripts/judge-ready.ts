// Prints which approved judge demo assets (data/judge-demo.json) are ready.
// Opens the database read-only; changes nothing. Usage: npm run judge:ready
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { paths } from "../src/server/config";
import type { Db } from "../src/server/db/client";
import * as schema from "../src/server/db/schema";
import { curatedDemo, judgeDemoPath } from "../src/server/judge/demo";

const sqlite = new Database(paths.db, { readonly: true, fileMustExist: true });
const db = drizzle(sqlite, { schema }) as Db;
const demo = curatedDemo(db);

console.log(`Judge demo list: ${judgeDemoPath()}\n`);
for (const c of demo.checks) console.log(`${c.ready ? "READY  " : "MISSING"}  ${c.area.padEnd(9)} ${c.ref}  ${c.detail}`);
const failed = demo.checks.filter((c) => !c.ready).length;
console.log(`\n${demo.checks.length - failed}/${demo.checks.length} ready`);
sqlite.close();
process.exitCode = failed ? 1 : 0;
