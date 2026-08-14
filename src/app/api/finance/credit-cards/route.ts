import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const today = new Date();
    // Pega faturas a partir do mês atual e próximos
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const entries = await prisma.financeEntry.findMany({
      where: {
        type: "expense",
        status: "pending",
        paymentMethod: "cartão",
        date: { gte: startOfMonth },
      },
      orderBy: { date: "asc" }
    });

    // Agrupar por Mês/Ano (ex: "2026-08")
    const invoices: Record<string, number> = {};
    for (const e of entries) {
      const monthStr = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
      invoices[monthStr] = (invoices[monthStr] || 0) + e.amount;
    }

    // Converter para array
    const result = Object.entries(invoices).map(([month, total]) => ({
      month,
      total
    }));

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
