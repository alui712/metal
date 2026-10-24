import "server-only";
import { count } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "./db/client";
import { recordings } from "./db/schema";

// Read helpers for Server Components. `connection()` marks each read as
// request-time data: SQLite reads are synchronous and would otherwise be
// frozen into the prerendered shell.

export async function getLibraryStats() {
  await connection();
  const [{ n }] = getDb().select({ n: count() }).from(recordings).all();
  return { recordingCount: n };
}
