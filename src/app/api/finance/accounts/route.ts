import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Busca todas as contas únicas já utilizadas em lançamentos
  const accountsData = await prisma.financeEntry.findMany({
    select: { account: true },
    distinct: ["account"],
  });

  const accounts = accountsData
    .map(a => a.account)
    .filter(Boolean)
    .sort();

  return NextResponse.json(accounts);
});
