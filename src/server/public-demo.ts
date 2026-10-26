// Public online demo (METAL_PUBLIC_DEMO=1): a read-only copy of METAL with
// approved sample recordings. Nothing can be recorded, imported, edited,
// exported or processed — every write is refused before it reaches a route
// (src/proxy.ts). Shared by the proxy and server components, so no "server-only".

export const isPublicDemo = () => process.env.METAL_PUBLIC_DEMO === "1";

export const DEMO_READ_ONLY = "This is METAL’s read-only online demo. Recording, importing, editing and exports run in the local app.";

const WRITE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** GET routes that describe this computer (OBS connection settings, watched folders): not part of the demo. */
const LOCAL_ONLY = [/^\/api\/capture\/config(\/|$)/, /^\/api\/sources(\/|$)/];

/** Pure: why the demo refuses a request, or null to let it through. */
export function demoRefusal(method: string, pathname: string): string | null {
  if (WRITE.has(method.toUpperCase())) return DEMO_READ_ONLY;
  if (LOCAL_ONLY.some((r) => r.test(pathname))) return "Recording and watched folders run only in the local app.";
  return null;
}
