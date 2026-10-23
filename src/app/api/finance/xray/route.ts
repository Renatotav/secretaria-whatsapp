import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { normalizeItemCategory, spreadDiscount } from "@/lib/finance-taxonomy";

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

  // Subcategorias fixas (as antigas da IA são traduzidas aqui); cerveja/salgadinho/doce = "Besteira".
  // Desconto da nota espalhado pelos itens dela (cada produto com o preço pago de verdade).
  const porNota = new Map<string, typeof items>();
  for (const i of items) porNota.set(i.financeEntryId, [...(porNota.get(i.financeEntryId) ?? []), i]);
  const pagos = [...porNota.values()].flatMap((lista) => spreadDiscount(lista));
  return NextResponse.json(pagos.map((i) => ({ ...i, category: normalizeItemCategory(i) })));
});
