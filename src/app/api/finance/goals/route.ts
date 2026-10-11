import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const goals = await prisma.savingsGoal.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(goals);
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
