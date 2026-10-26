import { NextResponse, type NextRequest } from "next/server";
import { demoRefusal, demoRoute, isFixtureDemo, isPublicDemo } from "@/server/public-demo";

// Only active in the public online demo; the local app is unaffected.
export function proxy(request: NextRequest) {
  if (!isPublicDemo()) return NextResponse.next();
  const fixtures = isFixtureDemo();
  const { pathname, searchParams } = request.nextUrl;
  const refusal = demoRefusal(request.method, pathname, fixtures);
  if (refusal) return NextResponse.json({ error: refusal, demo: true }, { status: 403 });
  const route = demoRoute(pathname, searchParams, fixtures);
  if (route) return NextResponse.redirect(new URL(route.redirect, request.url));
  return NextResponse.next();
}

export const config = {
  // Every route except static assets (incl. the synthetic demo clips in public/demo/), so page-level server actions are covered too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|metal-mark.svg|demo/).*)"],
};
