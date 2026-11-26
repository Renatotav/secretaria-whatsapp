import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, personalGen, verifySessionToken } from "@/lib/session-token";

// /api/work/ingest e /api/work/ext/*: extensão do trabalho, protegidas por chave própria (não pelo login).
// /api/scooter/charge: programinha do notebook (tomada da scooter), também com chave própria.
// /api/aircon/oauth: a Samsung volta aqui depois de autorizar a chave permanente (protegida pelo state).
// /manifest.webmanifest e /icons/: o celular lê antes do login para instalar o painel como app.
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/webhook", "/api/work/ingest", "/api/work/ext/", "/api/scooter/charge", "/api/aircon/oauth", "/api/strava/oauth", "/api/scooter/status", "/api/scooter/command", "/api/presence", "/api/alexa/skill", "/api/mcp", "/manifest.webmanifest", "/icons/"];

const PERSONAL_PATHS = ["/treino", "/corpo", "/api/treino", "/api/corpo", "/api/painel/ask"];

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
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(cookie))) {
    // Personal (irmão): só Treino e Corpo. As rotas ainda conferem se o acesso não foi tirado.
    if (await personalGen(cookie)) {
      if (PERSONAL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
      return pathname.startsWith("/api/") ? NextResponse.json({ error: "Não autorizado" }, { status: 401 }) : NextResponse.redirect(new URL("/treino", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
