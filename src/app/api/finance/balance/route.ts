import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { autoMarkPaid } from "@/lib/auto-pay";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Verifica e atualiza lançamentos pendentes que já venceram
  await autoMarkPaid();

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // formato YYYY-MM
  const account = searchParams.get("account");

  if (!month) {
    return NextResponse.json({ error: "Mês obrigatório" }, { status: 400 });
  }

  const [y, m] = month.split("-").map(Number);
  
  const whereClause: any = {
    date: { lt: new Date(y, m - 1, 1) }
  };
  if (account && account !== "all") {
    whereClause.account = { equals: account, mode: "insensitive" };
  }

  // Calcula o saldo anterior (tudo que for estritamente menor que o primeiro dia do mês requisitado)
  const previousEntries = await prisma.financeEntry.findMany({
    where: { ...whereClause, status: "paid" },
    select: {
      type: true,
      amount: true,
    }
  });

  let previousBalance = 0;
  for (const entry of previousEntries) {
    if (entry.type === "income") previousBalance += entry.amount;
    else previousBalance -= entry.amount;
  }

  return NextResponse.json({ previousBalance });
});
