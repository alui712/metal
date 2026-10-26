// Public online demo: a read-only copy of METAL. Nothing can be recorded,
// imported, edited, exported or processed — every write is refused before it
// reaches a route (src/proxy.ts). Shared by the proxy, server components and
// the DB client, so no "server-only".
//
// Two flavours:
// - METAL_PUBLIC_DEMO=1 — real (cleared) sample recordings baked into the image.
// - METAL_PUBLIC_DEMO=fixtures, and always on Vercel — fictional demo fixtures
//   only. No database file, no recordings, no models: every page that would
//   show a real library goes to its fixture version instead.

export const isFixtureDemo = () => process.env.METAL_PUBLIC_DEMO === "fixtures" || process.env.VERCEL === "1";

export const isPublicDemo = () => process.env.METAL_PUBLIC_DEMO === "1" || isFixtureDemo();

export const DEMO_READ_ONLY = "This is METAL’s read-only online demo. Recording, importing, editing and exports run in the local app.";

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** GET routes that describe this computer (OBS connection settings, watched folders): not part of the demo. */
const LOCAL_ONLY = [/^\/api\/capture\/config(\/|$)/, /^\/api\/sources(\/|$)/];

/** Fixture demo: the only API read the pages make (the shell's capture status, from the empty in-memory database). */
const FIXTURE_API = [/^\/api\/capture$/];

/** Pure: why the demo refuses a request, or null to let it through. */
export function demoRefusal(method: string, pathname: string, fixtures = false): string | null {
  if (WRITE.has(method.toUpperCase())) return DEMO_READ_ONLY;
  if (LOCAL_ONLY.some((r) => r.test(pathname))) return "Recording and watched folders run only in the local app.";
  if (fixtures && pathname.startsWith("/api/") && !FIXTURE_API.some((r) => r.test(pathname))) return "Not part of the online demo: it has no recordings. Search, media and exports run in the local app.";
  return null;
}

/** Pages that act on this computer: in the demo they explain that they run locally. */
const LOCAL_PAGES = [/^\/import$/, /^\/sources$/, /^\/settings$/];
/** Fixture demo: pages that only show a real library. */
const LIBRARY_PAGES = [/^\/clips$/, /^\/status$/, /^\/recordings\//];

/**
 * Pure: where the demo sends a page request — a redirect to a fixture page or
 * to /local-only (a redirect, not a rewrite: the static page must hydrate
 * under its own URL), or null to serve it as is.
 */
export function demoRoute(pathname: string, search: URLSearchParams, fixtures = false): { redirect: string } | null {
  // The capture dashboard needs OBS on this computer; visitors start at the showcase.
  if (pathname === "/") return { redirect: "/showcase" };
  if (LOCAL_PAGES.some((r) => r.test(pathname)) || (fixtures && LIBRARY_PAGES.some((r) => r.test(pathname)))) return { redirect: "/local-only" };
  if (!fixtures) return null;
  if (pathname === "/recall") {
    const q = search.get("q");
    return { redirect: q ? `/recall/demo?${new URLSearchParams({ q })}` : "/recall/demo" };
  }
  if (pathname === "/sessions") return { redirect: "/sessions/demo" };
  if ((pathname === "/povs" || pathname.startsWith("/povs/")) && pathname !== "/povs/demo") return { redirect: "/povs/demo" };
  if (pathname === "/studio" && search.get("demo") !== "1") return { redirect: "/studio?demo=1" };
  return null;
}
