import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { airconOauthFinish, airconOauthStart } from "@/lib/aircon";

export const dynamic = "force-dynamic";

// Chave permanente do SmartThings. POST (logado): cria o app e devolve o link da Samsung.
// GET (pública, a Samsung volta aqui): só vale com o `state` de uso único gerado no POST.
const origem = (request: Request) => {
  const host = request.headers.get("x-forwarded-host");
  return host ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${host}` : new URL(request.url).origin;
};

export const POST = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const r = await airconOauthStart(origem(request));
  return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
});

export const GET = withErrorHandling(async (request: Request) => {
  const u = new URL(request.url);
  const ok = await airconOauthFinish(u.searchParams.get("code") ?? "", u.searchParams.get("state") ?? "").catch(() => false);
  return NextResponse.redirect(`${origem(request)}/ar?chave=${ok ? "ok" : "erro"}`);
});
