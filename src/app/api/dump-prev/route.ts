import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const previousEntries = await prisma.financeEntry.findMany({
    where: { date: { lt: new Date(2026, 7, 1) }, status: "paid", account: "Principal" },
    select: { id: true, description: true, amount: true, date: true, type: true }
  });

  return NextResponse.json({ previousEntries });
}
