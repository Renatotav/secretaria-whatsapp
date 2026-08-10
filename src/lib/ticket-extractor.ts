import { prisma } from "./prisma";

interface ParsedTicketId {
  prefix: string;
  ticketId: string;
}

/**
 * Normaliza os formatos de chamado aceitos: S/R + 6-7 dígitos, número solto
 * de 6-7 dígitos, ou "redmine" (com # opcional) + número.
 */
function parseTicketId(rawId: string): ParsedTicketId | null {
  const trimmed = rawId.trim();

  const srMatch = trimmed.match(/^([SR])(\d{6,7})$/i);
  if (srMatch) {
    const prefix = srMatch[1].toUpperCase();
    return { prefix, ticketId: `${prefix}${srMatch[2]}` };
  }

  const bareMatch = trimmed.match(/^(\d{6,7})$/);
  if (bareMatch) {
    return { prefix: "", ticketId: bareMatch[1] };
  }

  const redmineMatch = trimmed.match(/^redmine\s*#?\s*(\d+)$/i);
  if (redmineMatch) {
    return { prefix: "REDMINE", ticketId: `REDMINE${redmineMatch[1]}` };
  }

  return null;
}

export async function extractAndSaveTickets(
  ticketIds: string[],
  context: string,
  senderName: string,
  groupJid: string,
  groupName: string
): Promise<void> {
  for (const rawId of ticketIds) {
    const parsed = parseTicketId(rawId);
    if (!parsed) continue;
    const { prefix, ticketId } = parsed;

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
