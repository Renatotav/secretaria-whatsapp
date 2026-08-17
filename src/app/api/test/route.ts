import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const config = await prisma.agentConfig.findFirst();
  
  const now = new Date();
  const brtDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const today = brtDate.toISOString().split("T")[0];

  const finances = await prisma.financeEntry.findMany({
    where: {
      OR: [
        { date: { gte: new Date(today + "T00:00:00Z"), lte: new Date(today + "T23:59:59Z") } },
        { purchaseDate: { gte: new Date(today + "T00:00:00Z"), lte: new Date(today + "T23:59:59Z") } }
      ]
    }
  });

  const allFinances = await prisma.financeEntry.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json({
    hasConfig: !!config,
    aiProvider: config?.aiProvider,
    hasGroqKey: !!config?.groqApiKey,
    today,
    financesFound: finances.length,
    allFinancesDates: allFinances.map(f => ({ date: f.date, purchaseDate: f.purchaseDate }))
  });
}
