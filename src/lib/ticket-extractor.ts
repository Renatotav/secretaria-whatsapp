import { prisma } from "./prisma";

export async function extractAndSaveTickets(
  ticketIds: string[],
  context: string,
  senderName: string,
  groupJid: string,
  groupName: string
): Promise<void> {
  for (const rawId of ticketIds) {
    const match = rawId.match(/^([A-Za-z]*)(\d+)$/);
    if (!match) continue;
    const prefix = match[1].toUpperCase();
    const ticketId = rawId.toUpperCase();

    const existing = await prisma.ticket.findFirst({ where: { ticketId } });

    const contextLower = context.toLowerCase();
    let inferredStatus: string | undefined;
    if (/resolvido|encerrado|feito|finalizado/.test(contextLower)) {
      inferredStatus = "resolved";
    } else if (/urgent|priorizar|escalar|escalado/.test(contextLower)) {
      inferredStatus = "escalated";
    }

    const mention = {
      senderName,
      groupName,
      context: context.slice(0, 200),
      at: new Date().toISOString(),
    };

    if (!existing) {
      await prisma.ticket.create({
        data: {
          ticketId,
          prefix,
          groupJid,
          groupName,
          status: inferredStatus ?? "open",
          title: `Chamado ${ticketId}`,
          mentions: JSON.stringify([mention]),
          lastSeen: new Date(),
        },
      });
    } else {
      const mentions = JSON.parse(existing.mentions ?? "[]") as unknown[];
      mentions.push(mention);
      await prisma.ticket.update({
        where: { id: existing.id },
        data: {
          lastSeen: new Date(),
          mentions: JSON.stringify(mentions),
          ...(inferredStatus ? { status: inferredStatus } : {}),
        },
      });
    }
  }
}
