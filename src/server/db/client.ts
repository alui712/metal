import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { paths } from "../config";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
};

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** Opens (and migrates) a database. Use ":memory:" in tests. */
export function openDb(file: string): Db {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // The Next.js server and the worker share this file.
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

// Survive dev-server HMR without leaking connections.
const globalForDb = globalThis as unknown as { __metalDb?: Db };

export function getDb(): Db {
  globalForDb.__metalDb ??= openDb(paths.db);
  return globalForDb.__metalDb;
}
