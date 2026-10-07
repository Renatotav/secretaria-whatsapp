import { prisma } from "./prisma";
import { generateResponse, ProviderOptions } from "./openai";
import { sendWhatsAppMessage } from "./evolution";

function getWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const brtDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const day = brtDate.getUTCDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(brtDate);
  monday.setUTCDate(brtDate.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    weekStart: monday.toISOString().split("T")[0],
    weekEnd: sunday.toISOString().split("T")[0],
  };
}

export async function generateWeeklyReport(
  ownerName: string,
  ownerRole: string,
  ownerPhone: string,
  providerOpts: ProviderOptions,
  evolutionConfig: { evolutionUrl: string; evolutionApiKey: string; instanceId: string }
): Promise<void> {
  const { weekStart, weekEnd } = getWeekBounds();

  const existing = await prisma.weeklyReport.findFirst({ where: { weekStart } });
  if (existing) return;

  // Relatório com números calculados pelo código (antes a IA escrevia tudo e
  // inventava chamados/equipe/gastos). A IA só faz o comentário do fim.
  const { buildWeeklyDigest } = await import("./message-handlers");
  const { text: content } = await buildWeeklyDigest(providerOpts);
  const finances = await prisma.financeEntry.findMany({
    where: { date: { gte: new Date(weekStart), lte: new Date(weekEnd + "T23:59:59Z") } },
    orderBy: { date: "asc" },
  });

  const record = await prisma.weeklyReport.create({
    data: { weekStart, weekEnd, content },
  });

  if (ownerPhone && evolutionConfig.evolutionUrl) {
    await sendWhatsAppMessage(
      evolutionConfig.evolutionUrl,
      evolutionConfig.evolutionApiKey,
      evolutionConfig.instanceId,
      ownerPhone,
      content
    );
    await prisma.weeklyReport.update({
      where: { id: record.id },
      data: { sentAt: new Date() },
    });

    // Gráficos da semana: tetos do mês e gastos por categoria (x mês passado).
    try {
      const { sendBudgetChart, sendMonthChart } = await import("./message-handlers");
      const config = await prisma.agentConfig.findFirst();
      if (config) {
        const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
        await sendBudgetChart(config);
        await sendMonthChart(config, brtNow.getUTCFullYear(), brtNow.getUTCMonth());
      }
    } catch (err) {
      console.error("[weekly] falha ao enviar gráficos", err);
    }

    // Passo 2: O Diário de Arrependimentos
    // Localizar a pior despesa (não essencial)
    const badKeywords = ["delivery", "ifood", "bebida", "cerveja", "besteira", "lanche", "bar"];
    const badExpenses = finances.filter(f => 
      f.type === "expense" && 
      (badKeywords.some(kw => f.category.toLowerCase().includes(kw) || f.subcategory.toLowerCase().includes(kw)))
    ).sort((a, b) => b.amount - a.amount);

    if (badExpenses.length > 0 && badExpenses[0].amount >= 30) {
      const worst = badExpenses[0];
      const dStr = worst.date.toLocaleDateString("pt-BR", { weekday: 'long' });
      const regretMsg = `\n🤔 *PS (Reflexão):* ${/^(s[áa]bado|domingo)/i.test(dStr) ? "No" : "Na"} ${dStr}, você gastou R$ ${worst.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} com ${worst.category} (${worst.subcategory || worst.description}).\nHoje, de cabeça fria, valeu a pena ou bateu arrependimento? Responda a essa mensagem para eu guardar no seu Diário!`;
      
      await sendWhatsAppMessage(
        evolutionConfig.evolutionUrl,
        evolutionConfig.evolutionApiKey,
        evolutionConfig.instanceId,
        ownerPhone,
        regretMsg
      );
    }
  }
}
