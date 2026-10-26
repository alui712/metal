import { NextResponse, type NextRequest } from "next/server";
import { demoRefusal, isPublicDemo } from "@/server/public-demo";

// Pages that act on this computer: in the demo they explain that they run locally.
const LOCAL_PAGES = ["/import", "/sources", "/settings"];

// Only active in the public online demo; the local app is unaffected.
export function proxy(request: NextRequest) {
  if (!isPublicDemo()) return NextResponse.next();
  const refusal = demoRefusal(request.method, request.nextUrl.pathname);
  if (refusal) return NextResponse.json({ error: refusal, demo: true }, { status: 403 });
  // The capture dashboard needs OBS on this computer; visitors start at the showcase instead.
  if (request.nextUrl.pathname === "/") return NextResponse.redirect(new URL("/showcase", request.url));
  if (LOCAL_PAGES.includes(request.nextUrl.pathname)) return NextResponse.rewrite(new URL("/local-only", request.url));
  return NextResponse.next();
}

export const config = {
  // Every route except static assets, so page-level server actions are covered too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|metal-mark.svg).*)"],
};
