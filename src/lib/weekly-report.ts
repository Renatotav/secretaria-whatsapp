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

  const [summaries, agendaItems, tickets, briefings, finances, diaries] = await Promise.all([
    prisma.dailySummary.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
      orderBy: { date: "asc" },
    }),
    prisma.agendaItem.findMany({
      where: { createdAt: { gte: new Date(weekStart), lte: new Date(weekEnd + "T23:59:59Z") } },
    }),
    prisma.ticket.findMany({
      where: { updatedAt: { gte: new Date(weekStart) } },
    }),
    prisma.briefing.findMany({
      where: { receivedAt: { gte: new Date(weekStart) } },
    }),
    prisma.financeEntry.findMany({
      where: { date: { gte: new Date(weekStart), lte: new Date(weekEnd + "T23:59:59Z") } },
      orderBy: { date: "asc" },
    }),
    prisma.diaryEntry.findMany({
      where: { date: { gte: new Date(weekStart), lte: new Date(weekEnd + "T23:59:59Z") } },
      orderBy: { date: "asc" },
    }),
  ]);

  const dataText = [
    "=== RESUMOS DIÁRIOS ===",
    summaries.map((s) => `[${s.date}] ${s.groupName}:\n${s.summary}`).join("\n\n"),
    "=== AGENDA ===",
    agendaItems.map((a) => `[${a.category}] ${a.title} — ${a.done ? "CONCLUÍDO" : "PENDENTE"}`).join("\n"),
    "=== CHAMADOS ===",
    tickets.map((t) => `${t.ticketId} [${t.status}] ${t.groupName}`).join("\n"),
    "=== CONTATOS PRIVADOS ===",
    briefings.map((b) => `${b.contactName} [${b.urgency}]: ${b.subject}`).join("\n"),
    "=== FINANÇAS DA SEMANA ===",
    finances.map((f) => `[${f.date.toISOString().split("T")[0]}] [${f.type === "income" ? "RECEITA" : "DESPESA"}] ${f.category}${f.subcategory ? ` (${f.subcategory})` : ""} - R$ ${f.amount.toFixed(2)} (Humor: ${f.mood})`).join("\n"),
    "=== DIÁRIO DA SEMANA ===",
    diaries.map((d) => `[${d.date.toISOString().split("T")[0]}] Humor: ${d.mood}\nResumo: ${d.content}`).join("\n\n"),
  ].join("\n\n");

  const startFormatted = new Date(weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const endFormatted = new Date(weekEnd).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

const systemPrompt = `Você é assistente pessoal de ${ownerName}, ${ownerRole}.
Analise a semana completa (resumos diários, agenda, chamados, contatos, finanças e diário).

Inclua:
1. Visão geral da semana
2. Chamados: abertos, resolvidos, escalados, recorrentes
3. Tarefas: concluídas vs pendentes
4. Finanças Emocionais: Análise rápida de entradas vs saídas e os maiores gastos. OBRIGATÓRIO: Relacione os dias de pico de gastos (especialmente besteiras/delivery) com o humor relatado no "DIÁRIO DA SEMANA" naqueles mesmos dias.
5. Equipe: padrões (ausências, quem mais aciona você)
6. Alertas para a próxima semana
7. Uma sugestão de prioridade para segunda-feira

Formato para WhatsApp:
📊 *Relatório Semanal*
_semana de ${startFormatted} a ${endFormatted}_

*📈 Visão Geral:* [resumo executivo]
*🎫 Chamados:* Abertos: X | Resolvidos: X | Escalados: X
*✅ Tarefas:* Concluídas: X | Pendentes: X
*💰 Finanças Emocionais:* Entrou: R$ X | Saiu: R$ X | Destaque: [maior despesa e o cruzamento com o humor do diário]
*👥 Equipe:* [padrões observados]
*⚠️ Atenção:* [alertas]
*💡 Prioridade segunda:* [sugestão]`;

  const { content } = await generateResponse(
    [{ role: "user", content: dataText }],
    systemPrompt,
    0.5,
    1500,
    providerOpts
  );

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
      const regretMsg = `\n🤔 *PS (Reflexão):* Na ${dStr}, você gastou R$ ${worst.amount.toFixed(2)} com ${worst.category} (${worst.subcategory || worst.description}).\nHoje, de cabeça fria, valeu a pena ou bateu arrependimento? Responda a essa mensagem para eu guardar no seu Diário!`;
      
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
