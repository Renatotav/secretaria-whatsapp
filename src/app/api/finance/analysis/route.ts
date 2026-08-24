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
    if (!config) {
      return NextResponse.json({ error: "Configuração não encontrada" }, { status: 500 });
    }

    const providerOpts = {
      aiProvider: config.aiProvider,
      openaiApiKey: config.openaiApiKey,
      openaiModel: config.openaiModel,
      groqApiKey: config.groqApiKey,
      groqModel: config.groqModel,
      googleApiKey: config.googleApiKey,
      googleModel: config.googleModel,
      openrouterApiKey: config.openrouterApiKey,
      openrouterModel: config.openrouterModel,
    };

    const [yearStr, monthStr] = month.split("-");
    const m = parseInt(monthStr, 10) - 1;
    const y = parseInt(yearStr, 10);
    
    const startOfMonth = new Date(y, m, 1);
    const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59);

    // Busca entradas financeiras incluindo os itens de nota fiscal
    const entries = await prisma.financeEntry.findMany({
      where: { date: { gte: startOfMonth, lte: endOfMonth } },
      include: { invoiceItems: true }
    });

    if (entries.length === 0) {
      return NextResponse.json({ analysis: "Não há dados suficientes neste mês para gerar um relatório de insights." });
    }

    let income = 0;
    let expense = 0;
    const categories: Record<string, number> = {};
    const moods: Record<string, number> = {};

    // Agrupa itens de nota fiscal por humor da entrada pai
    const itemsByMood: Record<string, { name: string; amount: number; qty: number }[]> = {};

    for (const e of entries) {
      if (e.type === "income") income += e.amount;
      if (e.type === "expense") {
        expense += e.amount;
        categories[e.category] = (categories[e.category] || 0) + e.amount;
        if (e.mood && e.mood !== "neutro") {
          moods[e.mood] = (moods[e.mood] || 0) + e.amount;

          // Registra os itens de nota fiscal comprados nesse humor
          if (e.invoiceItems.length > 0) {
            if (!itemsByMood[e.mood]) itemsByMood[e.mood] = [];
            for (const item of e.invoiceItems) {
              const existing = itemsByMood[e.mood].find(
                i => i.name.toUpperCase() === item.name.toUpperCase()
              );
              if (existing) {
                existing.amount += item.amount;
                existing.qty += item.quantity;
              } else {
                itemsByMood[e.mood].push({ name: item.name, amount: item.amount, qty: item.quantity });
              }
            }
          }
        }
      }
    }

    const categoryText = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => `- ${cat}: R$ ${val.toFixed(2)}`)
      .join("\n");

    const moodText = Object.keys(moods).length > 0
      ? Object.entries(moods)
          .sort((a, b) => b[1] - a[1])
          .map(([mood, val]) => {
            const moodLabel = mood.toUpperCase();
            const items = itemsByMood[mood];
            let line = `- ${moodLabel}: R$ ${val.toFixed(2)}`;
            if (items && items.length > 0) {
              const top = [...items].sort((a, b) => b.amount - a.amount).slice(0, 5);
              line += `\n  Produtos comprados: ${top.map(i => `${i.name} (${i.qty}x = R$${i.amount.toFixed(2)})`).join(", ")}`;
            }
            return line;
          })
          .join("\n")
      : "Nenhum gasto com variação de humor registrada (tudo neutro).";

    const prompt = `Você é um consultor financeiro e coach emocional. Analise os gastos do mês com atenção especial nos padrões de consumo emocional. Use formatação Markdown. Seja direto, empático e prático. Máximo 300 palavras.

DADOS DO MÊS (${month}):
Receitas: R$ ${income.toFixed(2)}
Despesas: R$ ${expense.toFixed(2)}
Saldo: R$ ${(income - expense).toFixed(2)}

Gastos por Categoria:
${categoryText}

Gastos por Humor (com produtos comprados em cada estado emocional):
${moodText}

INSTRUÇÕES:
1. Se houver gastos em humores negativos (ruim, pessimo), destaque com atenção especial o padrão de consumo emocional.
2. Liste os produtos/itens comprados em momentos de humor negativo e mostre o impacto financeiro desse padrão.
3. Se não houver dados de humor registrados, foque nas categorias de maior gasto.
4. Chame o usuário de "Renato".
5. Termine com 2 dicas práticas de como identificar e evitar gastos emocionais no próximo mês.`;

    const { content } = await generateResponse(
      [{ role: "user", content: prompt }],
      "Você é um consultor financeiro e coach emocional.",
      0.7,
      1200,
      providerOpts
    );

    return NextResponse.json({ analysis: content });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
