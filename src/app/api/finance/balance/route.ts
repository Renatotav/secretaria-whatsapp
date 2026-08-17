import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

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

  // Calcula o saldo anterior
  const previousEntries = await prisma.financeEntry.findMany({
    where: whereClause,
    select: {
      type: true,
      amount: true,
      status: true,
    }
  });

  let previousBalance = 0; // Somente pagos
  let previousProjectedBalance = 0; // Pagos + Pendentes
  
  for (const entry of previousEntries) {
    if (entry.type === "income") {
      previousProjectedBalance += entry.amount;
      if (entry.status === "paid") previousBalance += entry.amount;
    } else {
      previousProjectedBalance -= entry.amount;
      if (entry.status === "paid") previousBalance -= entry.amount;
    }
  }

  return NextResponse.json({ previousBalance, previousProjectedBalance });
});
