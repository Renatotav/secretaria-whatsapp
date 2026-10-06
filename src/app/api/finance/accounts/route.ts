import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Busca todas as contas únicas já utilizadas em lançamentos
  const accountsData = await prisma.financeEntry.findMany({
    select: { account: true },
    distinct: ["account"],
  });

  // Mantém o nome como foi escrito ("VR" não vira "Vr"); repetidos que só
  // mudam maiúscula/minúscula aparecem uma vez.
  const byLower = new Map<string, string>();
  for (const a of accountsData) {
    const trimmed = a.account?.trim();
    if (trimmed && !byLower.has(trimmed.toLowerCase())) byLower.set(trimmed.toLowerCase(), trimmed);
  }

  const accounts = Array.from(byLower.values()).sort();

  return NextResponse.json(accounts);
});
