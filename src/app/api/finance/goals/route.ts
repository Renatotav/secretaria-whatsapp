import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
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
  try {
    const { id } = await req.json();
    await prisma.savingsGoal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
