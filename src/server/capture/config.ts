import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

// OBS connection settings. Stored in a 0600 file under the data dir (not the
// database, so DB copies never carry the password). The password is read
// only by the worker's capture service; nothing returns it to a client.

export type ObsConfig = { host: string; port: number; password: string | null; enabled: boolean };
export type PublicObsConfig = { host: string; port: number; hasPassword: boolean; enabled: boolean; configured: boolean };

export const DEFAULT_OBS = { host: "127.0.0.1", port: 4455 } as const;

const file = () => path.join(/*turbopackIgnore: true*/ config.dataDir, "obs-connection.json");

const HOST_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$|^\[?[0-9a-fA-F:]+\]?$/;

export function isLoopback(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "::1" || /^127(?:\.\d{1,3}){3}$/.test(h);
}

export function validateObsInput(input: { host?: unknown; port?: unknown; password?: unknown; enabled?: unknown }):
  | { ok: true; host: string; port: number; password: string | null | undefined; enabled: boolean }
  | { ok: false; error: string } {
  const host = typeof input.host === "string" ? input.host.trim() : "";
  if (!host || host.length > 253 || !HOST_RE.test(host)) return { ok: false, error: "Enter a valid host, like 127.0.0.1." };
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: "Port must be a number from 1 to 65535." };
  let password: string | null | undefined;
  if (input.password === undefined) password = undefined; // keep the saved one
  else if (input.password === null || input.password === "") password = null;
  else if (typeof input.password === "string" && input.password.length <= 256) password = input.password;
  else return { ok: false, error: "Password is too long." };
  return { ok: true, host, port, password, enabled: input.enabled !== false };
}

export function readObsConfig(): ObsConfig | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as Partial<ObsConfig>;
    const v = validateObsInput(raw);
    if (!v.ok) return null;
    return { host: v.host, port: v.port, password: v.password ?? null, enabled: v.enabled };
  } catch {
    return null;
  }
}

export function writeObsConfig(next: ObsConfig): void {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
  fs.renameSync(tmp, file());
}

export function publicObsConfig(c: ObsConfig | null): PublicObsConfig {
  return c
    ? { host: c.host, port: c.port, hasPassword: Boolean(c.password), enabled: c.enabled, configured: true }
    : { ...DEFAULT_OBS, hasPassword: false, enabled: false, configured: false };
}

export function obsUrl(c: { host: string; port: number }): string {
  const h = c.host.includes(":") && !c.host.startsWith("[") ? `[${c.host}]` : c.host;
  return `ws://${h}:${c.port}`;
}
