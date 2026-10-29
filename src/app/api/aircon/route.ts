import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";
import { airconData, airconTick } from "@/lib/aircon";
import { notifyOwner } from "@/lib/owner-notify";

export const dynamic = "force-dynamic";

/**
 * Dados da aba Ar-condicionado (só leitura do SmartThings). Leitura com mais de
 * 3 min é refeita na hora: o agendador só lê de hora em hora e o painel mostrava
 * "desligado" com o ar ligado. Pelo airconTick para o aviso de chave vencida sair igual.
 */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const atual = await airconData();
  const lidaEm = !atual.empty ? atual.lidoEm : null;
  if (atual.empty || !lidaEm || Date.now() - new Date(lidaEm).getTime() > 3 * 60_000) {
    const aviso = await airconTick().catch(() => null);
    if (aviso) {
      const config = await prisma.agentConfig.findFirst();
      if (config) await notifyOwner(config, aviso).catch(() => {});
    }
    return NextResponse.json(await airconData());
  }
  return NextResponse.json(atual);
});
