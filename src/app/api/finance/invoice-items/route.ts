import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
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

  return NextResponse.json(items);
});
