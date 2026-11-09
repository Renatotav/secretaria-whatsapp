import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sobrasDoMes } from "@/lib/finance-common";

export async function GET(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || "default";
    
    const budgets = await prisma.budget.findMany({
      where: {
        OR: [{ month }, { month: "default" }],
      },
    });

    // Sobra do teto do mês anterior (só para um mês "AAAA-MM"): o painel soma no teto.
    const m = month.match(/^(\d{4})-(\d{2})$/);
    const sobras = m ? await sobrasDoMes(Number(m[1]), Number(m[2]) - 1) : new Map<string, number>();
    return NextResponse.json(budgets.map((b) => ({ ...b, sobra: sobras.get(b.category) ?? 0 })));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { category, amount, month } = await req.json();
    const targetMonth = month || "default";

    // Busca se já existe um orçamento para essa categoria nesse mês
    const existing = await prisma.budget.findFirst({
      where: { category, month: targetMonth },
    });

    if (existing) {
      const updated = await prisma.budget.update({
        where: { id: existing.id },
        data: { amount: Number(amount) },
      });
      return NextResponse.json(updated);
    }

    const created = await prisma.budget.create({
      data: {
        category,
        amount: Number(amount),
        month: targetMonth,
      },
    });
    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id } = await req.json();
    await prisma.budget.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
