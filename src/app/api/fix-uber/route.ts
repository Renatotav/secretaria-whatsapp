import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const deleted = await prisma.financeEntry.deleteMany({
    where: {
      amount: 33.98,
      date: { lt: new Date(2026, 7, 1) } // antes de 1 de agosto (mês 7 no JS)
    }
  });

  return NextResponse.json({ ok: true, deleted: deleted.count });
}
