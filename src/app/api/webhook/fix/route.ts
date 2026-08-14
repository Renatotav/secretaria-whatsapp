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

    const allEntries = await prisma.financeEntry.findMany();
    let fixedDatesCount = 0;
    
    for (const entry of allEntries) {
      let needsUpdate = false;
      const data: any = {};
      
      if (entry.date.getUTCHours() === 0 && entry.date.getUTCMinutes() === 0) {
        const newDate = new Date(entry.date);
        newDate.setUTCHours(12);
        data.date = newDate;
        needsUpdate = true;
      }
      
      if (entry.purchaseDate && entry.purchaseDate.getUTCHours() === 0 && entry.purchaseDate.getUTCMinutes() === 0) {
        const newPurchaseDate = new Date(entry.purchaseDate);
        newPurchaseDate.setUTCHours(12);
        data.purchaseDate = newPurchaseDate;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await prisma.financeEntry.update({
          where: { id: entry.id },
          data
        });
        fixedDatesCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      countPending: result.count, 
      countCard: resultCard.count,
      fixedDates: fixedDatesCount,
      message: "Migração de parcelas e cartões concluída com sucesso! Datas corrigidas também." 
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
