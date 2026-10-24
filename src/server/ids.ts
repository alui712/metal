import { randomUUID } from "node:crypto";

/** Short, URL-safe, prefixed ids (e.g. `rec_3f9a1c2b7d4e`). */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
