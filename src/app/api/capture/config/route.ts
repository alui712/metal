import { isLoopback, publicObsConfig, readObsConfig, validateObsInput, writeObsConfig } from "@/server/capture/config";
import { jsonError, privileged, sameOrigin } from "@/server/http";

export async function GET(request: Request) {
  if (!sameOrigin(request)) return jsonError(403, "Forbidden.");
  return Response.json(publicObsConfig(readObsConfig()));
}

/**
 * Saves the OBS connection. `password` omitted keeps the saved one; empty
 * or null clears it. The response never includes the password.
 */
export async function PUT(request: Request) {
  const denied = privileged(request);
  if (denied) return denied;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid request.");
  }
  const v = validateObsInput(body);
  if (!v.ok) return jsonError(400, v.error);
  if (!isLoopback(v.host)) return jsonError(400, "METAL only connects to OBS on this computer. Use 127.0.0.1 or localhost.");
  const current = readObsConfig();
  const next = { host: v.host, port: v.port, enabled: v.enabled, password: v.password === undefined ? (current?.password ?? null) : v.password };
  writeObsConfig(next);
  return Response.json(publicObsConfig(next));
}
