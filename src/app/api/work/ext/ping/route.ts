import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWorkToken } from "@/lib/work-auth";

// Teste de conexão da extensão ("Conectado à secretária ✅").
// ?ativo=1: ele clicou/digitou no Assyst ou no WhatsApp Web do trabalho agora
// (no máx. 1x a cada 5 min) — a Alexa sabe que ele não está em casa.
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ ok: false, error: "Chave inválida" }, { status: 401 });
  if (new URL(request.url).searchParams.get("ativo") === "1") {
    const { marcarNoTrabalho } = await import("@/lib/alexa");
    await marcarNoTrabalho();
    return NextResponse.json({ ok: true });
  }
  const total = await prisma.workTicket.count();
  return NextResponse.json({ ok: true, chamados: total });
}
