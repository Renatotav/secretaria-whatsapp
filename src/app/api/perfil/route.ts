import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { CATEGORIAS_PESSOAIS, despesasDoPerfil, FINANCE_TAXONOMY_DATA, normalizaPerfil } from "@/lib/finance-taxonomy";

/** Tela "Meu financeiro": o perfil desta instalação e as categorias que ele dá. */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const cfg = await prisma.agentConfig.findFirst({ select: { perfilFinanceiro: true } });
  const perfil = normalizaPerfil(cfg?.perfilFinanceiro);
  return NextResponse.json({ perfil, efetivas: despesasDoPerfil(perfil), lista: FINANCE_TAXONOMY_DATA.expense, pessoais: CATEGORIAS_PESSOAIS });
});

export const PUT = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const perfil = normalizaPerfil({ ...(body ?? {}), versao: 1 });
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true } });
  if (!cfg) return NextResponse.json({ error: "Configure a secretária primeiro (Mais → Configurações)." }, { status: 400 });
  await prisma.agentConfig.update({ where: { id: cfg.id }, data: { perfilFinanceiro: perfil as Prisma.InputJsonValue } });
  return NextResponse.json({ perfil, efetivas: despesasDoPerfil(perfil) });
});
