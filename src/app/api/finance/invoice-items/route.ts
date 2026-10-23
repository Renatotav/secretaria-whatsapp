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
  const entryId = searchParams.get("entryId");

  if (!entryId) {
    return NextResponse.json({ error: "ID da despesa é obrigatório" }, { status: 400 });
  }

  const items = await prisma.invoiceItem.findMany({
    where: { financeEntryId: entryId },
    orderBy: { amount: "desc" }, // Itens mais caros primeiro
  });

  // Igual ao Raio-X do mês: subcategorias fixas (cerveja/salgadinho/biscoito = Besteira)
  // e o desconto da nota espalhado pelos itens (preço pago de verdade; total igual).
  const pagos = spreadDiscount(items).map((i) => ({ ...i, category: normalizeItemCategory(i) }));
  return NextResponse.json(pagos.sort((a, b) => b.amount - a.amount));
});
