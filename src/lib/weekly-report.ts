import { prisma } from "./prisma";
import { generateResponse, ProviderOptions } from "./openai";
import { sendWhatsAppMessage } from "./evolution";

function getWeekBounds(): { weekStart: string; weekEnd: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
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

  const [summaries, agendaItems, tickets, briefings] = await Promise.all([
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
  ].join("\n\n");

  const startFormatted = new Date(weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const endFormatted = new Date(weekEnd).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  const systemPrompt = `Você é secretária de ${ownerName}, ${ownerRole}.
Analise a semana completa (resumos diários, agenda, chamados, contatos).

Inclua:
1. Visão geral da semana
2. Chamados: abertos, resolvidos, escalados, recorrentes
3. Tarefas: concluídas vs pendentes
4. Equipe: padrões (ausências, quem mais aciona você)
5. Alertas para a próxima semana
6. Uma sugestão de prioridade para segunda-feira

Formato para WhatsApp:
📊 *Relatório Semanal*
_semana de ${startFormatted} a ${endFormatted}_

*📈 Visão Geral:* [resumo executivo]
*🎫 Chamados:* Abertos: X | Resolvidos: X | Escalados: X
*✅ Tarefas:* Concluídas: X | Pendentes: X
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
  }
}
