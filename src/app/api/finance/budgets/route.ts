import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || "default";
    
    const budgets = await prisma.budget.findMany({
      where: {
        OR: [{ month }, { month: "default" }],
      },
    });

    return NextResponse.json(budgets);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
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
  try {
    const { id } = await req.json();
    await prisma.budget.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
