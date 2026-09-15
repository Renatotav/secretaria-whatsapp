import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Contas padrão que devem SEMPRE aparecer no seletor,
  // independente de já ter lançamentos cadastrados nelas.
  const DEFAULT_ACCOUNTS = ["Principal", "Ticket Alimentação"];

  // Busca todas as contas únicas já utilizadas em lançamentos
  const accountsData = await prisma.financeEntry.findMany({
    select: { account: true },
    distinct: ["account"],
  });

  const uniqueAccounts = new Set<string>(DEFAULT_ACCOUNTS);
  for (const a of accountsData) {
    if (a.account) {
      const trimmed = a.account.trim();
      const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
      uniqueAccounts.add(capitalized);
    }
  }

  // "Principal" sempre na frente, depois as demais em ordem alfabética
  const others = Array.from(uniqueAccounts)
    .filter((a) => a !== "Principal")
    .sort();
  const accounts = ["Principal", ...others];

  return NextResponse.json(accounts);
});
