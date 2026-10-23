import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { isBesteiraItem } from "@/lib/finance-taxonomy";

export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
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

  // Filtra por `date`: para cartão pendente é o vencimento, para pix/débito é a data da compra.
  // Não usar OR com purchaseDate pois causaria itens aparecerem em dois meses.
  const items = await prisma.invoiceItem.findMany({
    where: {
      financeEntry: {
        date: { gte: startOfMonth, lte: endOfMonth }
      }
    },
    include: {
      financeEntry: {
        select: {
          date: true,
          category: true,
          description: true,
          paymentMethod: true,
          account: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  // Cerveja, salgadinho, doce… aparecem juntos como "Besteira" (mesma regra do teto de R$ 250).
  return NextResponse.json(items.map((i) => (isBesteiraItem(i) ? { ...i, category: "Besteira" } : i)));
});
