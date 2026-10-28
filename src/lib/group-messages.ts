// Mensagens de grupo do WhatsApp: guarda, resolve as menções (@) e decide se é
// algo para o dono. Saiu de message-handlers.ts (28/10/2026) — sem estado de conversa.

import { prisma } from "./prisma";
import { fetchGroupInfo, findContact } from "./evolution";
import { classifyGroupMessage } from "./classifier";
import { extractAndSaveTickets } from "./ticket-extractor";
import { getProviderOpts, notifyOwner } from "./owner-notify";
import { formatTime } from "./finance-text";

export async function resolveMentions(text: string, evoUrl: string, evoKey: string, instanceId: string): Promise<string> {
  const mentionRegex = /@(\d{10,15})/g;
  const matches = [...text.matchAll(mentionRegex)];
  const uniqueNumbers = [...new Set(matches.map((m) => m[1]))];

  let resolvedText = text;
  for (const num of uniqueNumbers) {
    const jid = `${num}@s.whatsapp.net`;
    const contact = await findContact(evoUrl, evoKey, instanceId, jid);
    if (contact && (contact.name || contact.pushName)) {
      const name = contact.name || contact.pushName;
      resolvedText = resolvedText.replace(new RegExp(`@${num}`, "g"), `@${name}`);
    }
  }
  return resolvedText;
}

export interface GroupMessageMeta {
  remoteJid: string;
  senderName: string;
  messageTimestamp: number;
}

export async function handleGroupMessage(joinedText: string, meta: GroupMessageMeta): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.enabled) return;

  const providerOpts = getProviderOpts(config);
  const groupJid = meta.remoteJid;

  let groupConfig = await prisma.groupConfig.findUnique({ where: { groupJid } });
  if (!groupConfig) {
    let newGroupName = groupJid.split("@")[0];
    if (config.evolutionUrl && config.evolutionApiKey && config.instanceId) {
      const info = await fetchGroupInfo(config.evolutionUrl, config.evolutionApiKey, config.instanceId, groupJid);
      if (info?.subject) {
        newGroupName = info.subject;
      }
    }
    groupConfig = await prisma.groupConfig.create({
      // Grupo novo começa DESLIGADO: só é lido pela IA se o dono ativar no
      // painel (antes todo grupo novo passava a ser monitorado sozinho).
      data: { groupJid, groupName: newGroupName, active: false },
    });
  } else if (/^\d+$/.test(groupConfig.groupName)) {
    if (config.evolutionUrl && config.evolutionApiKey && config.instanceId) {
      const info = await fetchGroupInfo(config.evolutionUrl, config.evolutionApiKey, config.instanceId, groupJid);
      if (info?.subject && info.subject !== groupConfig.groupName) {
        groupConfig = await prisma.groupConfig.update({
          where: { groupJid },
          data: { groupName: info.subject },
        });
      }
    }
  }
  if (!groupConfig.active) return;

  const groupName = groupConfig.groupName || groupJid.split("@")[0];
  let processedText = joinedText;

  if (config.evolutionUrl && config.evolutionApiKey && config.instanceId) {
    processedText = await resolveMentions(joinedText, config.evolutionUrl, config.evolutionApiKey, config.instanceId);
  }

  await prisma.groupMessage.create({
    data: {
      groupJid,
      groupName,
      senderName: meta.senderName,
      content: processedText,
      receivedAt: new Date(meta.messageTimestamp * 1000),
    },
  });

  let conv = await prisma.conversation.findFirst({ where: { phone: groupJid, source: "group" } });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { phone: groupJid, source: "group" } });
  }
  await prisma.message.create({
    data: { conversationId: conv.id, role: "user", content: `[${meta.senderName}] ${processedText}` },
  });

  const classification = await classifyGroupMessage(
    processedText,
    meta.senderName,
    groupName,
    groupConfig.focus,
    config.ownerName,
    config.ownerRole,
    providerOpts,
    config.systemPrompt
  );

  if (classification.ticketIds.length > 0) {
    await extractAndSaveTickets(classification.ticketIds, processedText, meta.senderName, groupJid, groupName);
  }

  if (classification.urgent && classification.category !== "ignore") {
    const agendaItem = await prisma.agendaItem.create({
      data: {
        source: "group",
        groupJid,
        groupName,
        category: classification.category ?? "mention",
        title: classification.title,
        description: classification.description,
        dueDate: classification.dueDate ? new Date(classification.dueDate) : null,
        senderName: meta.senderName,
        rawMessage: joinedText,
      },
    });

    if (config.ownerPhone && config.evolutionUrl) {
      const hora = formatTime(meta.messageTimestamp);
      const categoryBadge =
        classification.category === "mention"
          ? "🔔 Você foi mencionado"
          : classification.category === "task"
          ? "📋 Tarefa atribuída"
          : classification.category === "event"
          ? "📅 Evento com sua presença"
          : classification.category === "urgent_call"
          ? "🚨 Chamado urgente"
          : "";

      const notification = `👥 *${groupName}*\n👤 ${meta.senderName} — 🕐 ${hora}\n\n📌 *${classification.title}*\n${classification.description}${classification.dueDate ? `\n📅 ${new Date(classification.dueDate).toLocaleDateString("pt-BR")}` : ""}\n${categoryBadge}`;

      await notifyOwner(config, notification);
      await prisma.agendaItem.update({ where: { id: agendaItem.id }, data: { notified: true } });
    }
  }
}
