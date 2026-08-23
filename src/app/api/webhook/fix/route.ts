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

    // Corrigir receitas (ex: Salário) para Pix
    const resultIncome = await prisma.financeEntry.updateMany({
      where: {
        type: "income"
      },
      data: {
        paymentMethod: "pix"
      }
    });

    // Corrigir Aluguel / Moradia para Pix
    const resultAluguel = await prisma.financeEntry.updateMany({
      where: {
        OR: [
          { category: { contains: "Moradia", mode: "insensitive" } },
          { subcategory: { contains: "Aluguel", mode: "insensitive" } },
          { description: { contains: "Aluguel", mode: "insensitive" } },
        ]
      },
      data: {
        paymentMethod: "pix"
      }
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
      countIncome: resultIncome.count,
      countAluguel: resultAluguel.count,
      fixedDates: fixedDatesCount,
      message: "Migração de receitas e aluguel para Pix concluída com sucesso! Datas corrigidas também." 
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
