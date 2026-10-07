import { prisma } from "./prisma";
import { sendWhatsAppMessage } from "./evolution";

export async function checkPendingReminders(
  ownerPhone: string,
  reminderHours: number,
  evolutionConfig: { evolutionUrl: string; evolutionApiKey: string; instanceId: string }
): Promise<void> {
  if (!ownerPhone || !evolutionConfig.evolutionUrl) return;

  const cutoff = new Date(Date.now() - reminderHours * 60 * 60 * 1000);

  const pendingItems = await prisma.agendaItem.findMany({
    where: {
      done: false,
      reminded: false,
      notified: true,
      source: "group",
      createdAt: { lte: cutoff },
    },
  });

  for (const item of pendingItems) {
    const hoursAgo = Math.floor(
      (Date.now() - new Date(item.createdAt).getTime()) / (60 * 60 * 1000)
    );

    const message = `🔄 *Lembrete de pendência*
📋 ${item.title}
👥 ${item.groupName}${item.senderName ? ` — ${item.senderName}` : ""}
⏱️ Atribuído há ${hoursAgo}h — ainda pendente`;

    try {
      await sendWhatsAppMessage(
        evolutionConfig.evolutionUrl,
        evolutionConfig.evolutionApiKey,
        evolutionConfig.instanceId,
        ownerPhone,
        message
      );
      await prisma.agendaItem.update({
        where: { id: item.id },
        data: { reminded: true },
      });
    } catch {
      // silently skip if sending fails
    }
  }
}

/**
 * Lembretes pessoais com data/hora (agenda do canal pessoal, ex: "me lembra
 * de conferir a fatura dia 03/11"): avisa quando a hora chega, uma vez só.
 * Antes só as pendências de grupo eram lembradas — o lembrete com data era
 * salvo e nunca disparava.
 */
export async function checkDueReminders(
  ownerPhone: string,
  evolutionConfig: { evolutionUrl: string; evolutionApiKey: string; instanceId: string }
): Promise<void> {
  if (!ownerPhone || !evolutionConfig.evolutionUrl) return;
  const due = await prisma.agendaItem.findMany({
    where: { source: { not: "group" }, done: false, reminded: false, dueDate: { lte: new Date() } },
    orderBy: { dueDate: "asc" },
    take: 10,
  });
  for (const item of due) {
    const details = item.description && item.description !== item.title ? `\n${item.description}` : "";
    try {
      await sendWhatsAppMessage(
        evolutionConfig.evolutionUrl,
        evolutionConfig.evolutionApiKey,
        evolutionConfig.instanceId,
        ownerPhone,
        `⏰ *Lembrete*\n📋 ${item.title}${details}`
      );
      await prisma.agendaItem.update({ where: { id: item.id }, data: { reminded: true } });
    } catch {
      // tenta de novo no próximo ciclo
    }
  }
}
