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
