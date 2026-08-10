import { prisma } from "./prisma";
import { generateResponse, ProviderOptions } from "./openai";
import { sendWhatsAppMessage } from "./evolution";

export async function generateDailySummary(
  groupJid: string,
  groupName: string,
  groupFocus: string,
  ownerName: string,
  ownerRole: string,
  ownerPhone: string,
  providerOpts: ProviderOptions,
  evolutionConfig: { evolutionUrl: string; evolutionApiKey: string; instanceId: string }
): Promise<void> {
  const today = new Date().toISOString().split("T")[0];

  const existing = await prisma.dailySummary.findFirst({
    where: { groupJid, date: today },
  });
  if (existing) return;

  const messages = await prisma.groupMessage.findMany({
    where: {
      groupJid,
      summarized: false,
      receivedAt: {
        gte: new Date(today + "T00:00:00Z"),
        lte: new Date(today + "T23:59:59Z"),
      },
    },
    orderBy: { receivedAt: "asc" },
  });

  if (messages.length === 0) return;

  const messagesText = messages
    .map((m) => `[${m.senderName}] ${m.content}`)
    .join("\n");

  const dateFormatted = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const systemPrompt = `Você é secretária de ${ownerName}, ${ownerRole}.
Mensagens do grupo "${groupName}" de hoje. Foco: ${groupFocus}

Inclua: principais assuntos, chamados (com números), decisões,
situação da equipe, pendências em aberto.

Ignore: bom dia, figurinhas, brincadeiras, confirmações simples.

Formato para WhatsApp:
📋 *Resumo — ${groupName}*
_${dateFormatted}_

*📌 Destaques do dia:*
[tópicos]

*🎫 Chamados mencionados:*
[lista ou "Nenhum"]

*👥 Equipe:*
[ausências, novidades]

*⏳ Pendências:*
[o que ficou em aberto ou "Nenhuma"]`;

  const { content: summary } = await generateResponse(
    [{ role: "user", content: messagesText }],
    systemPrompt,
    0.5,
    1024,
    providerOpts
  );

  const record = await prisma.dailySummary.create({
    data: { groupJid, groupName, date: today, summary },
  });

  if (ownerPhone && evolutionConfig.evolutionUrl) {
    await sendWhatsAppMessage(
      evolutionConfig.evolutionUrl,
      evolutionConfig.evolutionApiKey,
      evolutionConfig.instanceId,
      ownerPhone,
      summary
    );
    await prisma.dailySummary.update({
      where: { id: record.id },
      data: { sentAt: new Date() },
    });
  }

  await prisma.groupMessage.updateMany({
    where: { groupJid, summarized: false },
    data: { summarized: true },
  });
}
