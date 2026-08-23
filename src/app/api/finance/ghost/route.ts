import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

// GET: mostra TODAS as entradas antes de agosto/2026 para encontrar fantasmas no saldo
// DELETE: apaga todas as entradas antes de agosto/2026 que estejam em branco ou com conta inválida
export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Busca TODAS as entradas sem filtro de conta
  const entries = await prisma.financeEntry.findMany({
    where: {
      date: { lt: new Date(2026, 7, 1) } // antes de agosto 2026
    },
    select: {
      id: true,
      type: true,
      amount: true,
      account: true,
      description: true,
      date: true,
      status: true,
    },
    orderBy: { date: "asc" }
  });

  // Agrupa por conta
  const byAccount: Record<string, { count: number; balance: number }> = {};
  for (const e of entries) {
    const acc = e.account || "(sem conta)";
    if (!byAccount[acc]) byAccount[acc] = { count: 0, balance: 0 };
    byAccount[acc].count++;
    byAccount[acc].balance += e.type === "income" ? e.amount : -e.amount;
  }

  return NextResponse.json({
    totalEntries: entries.length,
    byAccount,
    entries: entries.map(e => ({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      amount: e.amount,
      type: e.type,
      account: e.account,
      description: e.description,
      status: e.status,
    }))
  });
});

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  await prisma.financeEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: id });
});
