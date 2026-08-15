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
    return NextResponse.json({ error: "O parâmetro month (YYYY-MM) é obrigatório" }, { status: 400 });
  }

  const [y, m] = month.split("-").map(Number);
  const startOfMonth = new Date(y, m - 1, 1);
  const endOfMonth = new Date(y, m, 0, 23, 59, 59);

  // Busca todos os InvoiceItems cujas notas (FinanceEntry) pertencem ao mês especificado
  const items = await prisma.invoiceItem.findMany({
    where: {
      financeEntry: {
        date: {
          gte: startOfMonth,
          lte: endOfMonth
        }
      }
    },
    include: {
      financeEntry: {
        select: {
          date: true,
          category: true,
          description: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return NextResponse.json(items);
});
