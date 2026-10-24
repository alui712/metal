// Request guards for the local API (shared by route handlers).

/** Refuses cross-site requests: Origin, when present, must match Host. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin navigations, curl
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export const jsonError = (status: number, message: string) => Response.json({ error: message }, { status });

/**
 * Guard for privileged local actions (OBS control, settings): same origin,
 * plus a custom header so a cross-site form or simple request can't trigger it.
 */
export function privileged(request: Request): Response | null {
  if (!sameOrigin(request) || request.headers.get("x-metal-action") !== "1") return jsonError(403, "Forbidden.");
  return null;
}
