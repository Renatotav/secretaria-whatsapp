import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { stravaFinish, stravaSalvarApp, stravaStart, stravaStatus, stravaSync } from "@/lib/strava";

export const dynamic = "force-dynamic";

// Strava. POST (logado): {acao: "app", clientId, clientSecret} | {acao: "autorizar"} | {acao: "sync"} | {acao: "status"}.
// GET (pública, o Strava volta aqui): só vale com o `state` de uso único gerado no "autorizar".
const origem = (request: Request) => {
  const host = request.headers.get("x-forwarded-host");
  return host ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${host}` : new URL(request.url).origin;
};

export const POST = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { acao?: string; clientId?: string; clientSecret?: string };
  if (b.acao === "app") {
    const erro = await stravaSalvarApp(String(b.clientId ?? ""), String(b.clientSecret ?? ""));
    return NextResponse.json(erro ? { error: erro } : await stravaStatus(), { status: erro ? 400 : 200 });
  }
  if (b.acao === "autorizar") {
    const r = await stravaStart(origem(request));
    return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
  }
  if (b.acao === "sync") return NextResponse.json(await stravaSync());
  return NextResponse.json({ ...(await stravaStatus()), dominio: new URL(origem(request)).host });
});

export const GET = withErrorHandling(async (request: Request) => {
  const u = new URL(request.url);
  const ok = !u.searchParams.get("error") && (await stravaFinish(u.searchParams.get("code") ?? "", u.searchParams.get("state") ?? "").catch(() => false));
  if (ok) await stravaSync().catch(() => null);
  return NextResponse.redirect(`${origem(request)}/corpo?strava=${ok ? "ok" : "erro"}`);
});
