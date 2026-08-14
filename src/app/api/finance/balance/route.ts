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

  if (!month) {
    return NextResponse.json({ error: "Mês obrigatório" }, { status: 400 });
  }

  const [y, m] = month.split("-").map(Number);
  
  // Calcula o saldo anterior (tudo que for estritamente menor que o primeiro dia do mês requisitado)
  const previousEntries = await prisma.financeEntry.findMany({
    where: {
      date: { lt: new Date(y, m - 1, 1) },
    },
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
