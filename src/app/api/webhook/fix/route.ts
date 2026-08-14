import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const result = await prisma.financeEntry.updateMany({
      where: {
        description: { contains: "(previsto)" },
      },
      data: {
        status: "pending",
      },
    });

    const resultCard = await prisma.financeEntry.updateMany({
      where: {
        OR: [
          { category: { contains: "Cartão", mode: "insensitive" } },
          { subcategory: { contains: "Cartão", mode: "insensitive" } },
          { description: { contains: "Cartão", mode: "insensitive" } },
          { description: { contains: "Parcela", mode: "insensitive" } },
        ]
      },
      data: {
        paymentMethod: "cartão",
      },
    });

    return NextResponse.json({ 
      success: true, 
      countPending: result.count, 
      countCard: resultCard.count,
      message: "Migração de parcelas e cartões concluída com sucesso!" 
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
