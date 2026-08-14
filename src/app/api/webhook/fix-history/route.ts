import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Deleta tudo que for anterior a 1º de Agosto de 2026
    const result = await prisma.financeEntry.deleteMany({
      where: {
        date: { lt: new Date(2026, 7, 1) }, // 7 é Agosto no JS (0-indexed)
      },
    });

    return NextResponse.json({ 
      success: true, 
      deletedCount: result.count,
      message: "Histórico antigo apagado com sucesso! Agora Agosto é o mês 0." 
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
