import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateResponse } from "@/lib/openai";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    
    if (!month) {
      return NextResponse.json({ error: "month parameter is required" }, { status: 400 });
    }

    const config = await prisma.agentConfig.findFirst();
    if (!config || !config.openaiApiKey) {
      return NextResponse.json({ error: "OpenAI API Key not configured" }, { status: 500 });
    }

    const providerOpts = {
      aiProvider: config.aiProvider,
      openaiApiKey: config.openaiApiKey,
      openaiModel: config.openaiModel,
      groqApiKey: config.groqApiKey,
      groqModel: config.groqModel,
    };

    const [yearStr, monthStr] = month.split("-");
    const m = parseInt(monthStr, 10) - 1;
    const y = parseInt(yearStr, 10);
    
    const startOfMonth = new Date(y, m, 1);
    const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59);

    const entries = await prisma.financeEntry.findMany({
      where: { date: { gte: startOfMonth, lte: endOfMonth } }
    });

    if (entries.length === 0) {
      return NextResponse.json({ analysis: "Não há dados suficientes neste mês para gerar um relatório de insights." });
    }

    let income = 0;
    let expense = 0;
    const categories: Record<string, number> = {};

    for (const e of entries) {
      if (e.type === "income") income += e.amount;
      if (e.type === "expense") {
        expense += e.amount;
        categories[e.category] = (categories[e.category] || 0) + e.amount;
      }
    }

    const categoryText = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => `- ${cat}: R$ ${val.toFixed(2)}`)
      .join("\n");

    const prompt = `Você é um consultor financeiro inteligente. Analise os gastos deste mês e dê dicas práticas de economia e organização. Seja direto, amigável e use formatação Markdown. Não seja muito longo.

DADOS DO MÊS (${month}):
Receitas: R$ ${income.toFixed(2)}
Despesas: R$ ${expense.toFixed(2)}
Saldo: R$ ${(income - expense).toFixed(2)}

Gastos por Categoria:
${categoryText}`;

    const { content } = await generateResponse([{ role: "user", content: prompt }], "Você é um consultor financeiro.", 0.7, 1000, providerOpts);

    return NextResponse.json({ analysis: content });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
