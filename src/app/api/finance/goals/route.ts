import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reserveNow } from "@/lib/message-handlers";

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const goals = await prisma.savingsGoal.findMany({
      orderBy: { createdAt: "asc" },
    });
    // Reserva: mostra o valor de AGORA (guardado + o que o mês já tirou/somou na conta corrente).
    const reserva = goals.find((g) => /reserva/i.test(g.name));
    const agora = reserva ? await reserveNow(reserva) : null;
    return NextResponse.json(goals.map((g) => (g === reserva && agora && agora.mes !== 0 ? { ...g, guardado: g.currentAmount, mesAteAgora: agora.mes, currentAmount: agora.agora } : g)));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { name, targetAmount, deadline, color } = await req.json();
    const goal = await prisma.savingsGoal.create({
      data: {
        name,
        targetAmount: Number(targetAmount),
        deadline: deadline ? new Date(deadline) : null,
        color: color || "#7c6dff",
      },
    });
    return NextResponse.json(goal);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id, addAmount } = await req.json();
    const goal = await prisma.savingsGoal.findUnique({ where: { id } });
    if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });

    const updated = await prisma.savingsGoal.update({
      where: { id },
      data: { currentAmount: goal.currentAmount + Number(addAmount) },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id } = await req.json();
    await prisma.savingsGoal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
