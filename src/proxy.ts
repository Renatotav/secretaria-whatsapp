import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

// /api/work/ingest e /api/work/ext/*: extensão do trabalho, protegidas por chave própria (não pelo login).
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhook", "/api/work/ingest", "/api/work/ext/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // Cookie assinado (ver session-token.ts) — o valor antigo fixo não passa mais.
  if (!(await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
