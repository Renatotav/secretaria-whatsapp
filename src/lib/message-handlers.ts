import { prisma } from "./prisma";
import { sendTextWithTyping, getBase64FromMediaMessage } from "./evolution";
import { transcribeAudio, type ProviderOptions } from "./openai";
import { analyzePrivateMessage } from "./analyzer";
import { classifyGroupMessage } from "./classifier";
import { routePersonalMessage, parseStatementEntries, type PersonalQueryIntent } from "./personal-router";
import { extractAndSaveTickets } from "./ticket-extractor";
import type { AgentConfig } from "@prisma/client";

export function extractText(message: Record<string, unknown>): string {
  return (
    (message.conversation as string) ??
    (message.extendedTextMessage as Record<string, string>)?.text ??
    (message.imageMessage as Record<string, string>)?.caption ??
    ""
  );
}

export function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getProviderOpts(config: AgentConfig): ProviderOptions {
  return {
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
}

function getEvoConfig(config: AgentConfig) {
  return {
    evolutionUrl: config.evolutionUrl,
    evolutionApiKey: config.evolutionApiKey,
    instanceId: config.instanceId,
  };
}

async function notifyOwner(config: AgentConfig, text: string): Promise<void> {
  if (!config.ownerPhone || !config.evolutionUrl) return;
  const evo = getEvoConfig(config);
  await sendTextWithTyping(
    evo.evolutionUrl,
    evo.evolutionApiKey,
    evo.instanceId,
    config.ownerPhone,
    text,
    config.typingMsPerChar,
    config.typingMaxSeconds
  );
}

/**
 * Transcreve um áudio recebido via webhook. Tenta usar o base64 já embutido
 * no payload (webhookBase64 habilitado na Evolution); se não vier, cai no
 * fallback de baixar via getBase64FromMediaMessage.
 */
export async function transcribeIncomingAudio(
  evo: { evolutionUrl: string; evolutionApiKey: string; instanceId: string },
  messageId: string,
  message: Record<string, unknown>,
  providerOpts: ProviderOptions
): Promise<string> {
  const audioMessage = (message.audioMessage as Record<string, unknown>) ?? {};
  let base64 = (message.base64 as string) || (audioMessage.base64 as string) || "";
  let mimetype = (audioMessage.mimetype as string) || "audio/ogg";

  if (!base64) {
    const media = await getBase64FromMediaMessage(
      evo.evolutionUrl,
      evo.evolutionApiKey,
      evo.instanceId,
      messageId
    );
    base64 = media.base64;
    mimetype = media.mimetype || mimetype;
  }

  if (!base64) return "";

  const format = mimetype.includes("ogg") ? "ogg" : mimetype.split("/")[1]?.split(";")[0] || "ogg";
  return transcribeAudio(base64, format, providerOpts);
}

/**
 * Baixa o base64 de um documento (ex: PDF) recebido via webhook, com o
 * mesmo esquema de fallback usado para áudio.
 */
export async function downloadIncomingDocument(
  evo: { evolutionUrl: string; evolutionApiKey: string; instanceId: string },
  messageId: string,
  message: Record<string, unknown>
): Promise<{ base64: string; mimetype: string }> {
  const documentMessage = (message.documentMessage as Record<string, unknown>) ?? {};
  let base64 = (message.base64 as string) || (documentMessage.base64 as string) || "";
  let mimetype = (documentMessage.mimetype as string) || "application/pdf";

  if (!base64) {
    const media = await getBase64FromMediaMessage(
      evo.evolutionUrl,
      evo.evolutionApiKey,
      evo.instanceId,
      messageId
    );
    base64 = media.base64;
    mimetype = media.mimetype || mimetype;
  }

  return { base64, mimetype };
}

async function buildQueryResponse(intent: PersonalQueryIntent): Promise<string> {
  if (intent === "pending_today") {
    const items = await prisma.agendaItem.findMany({
      where: { done: false },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    return items.length
      ? `📋 *Pendências:*\n${items.map((i) => `• ${i.title}`).join("\n")}`
      : "✅ Nenhuma pendência no momento!";
  }

  if (intent === "open_tickets") {
    const tickets = await prisma.ticket.findMany({
      where: { status: "open" },
      orderBy: { lastSeen: "desc" },
      take: 10,
    });
    return tickets.length
      ? `🎫 *Chamados abertos:*\n${tickets.map((t) => `• ${t.ticketId} — ${t.groupName}`).join("\n")}`
      : "✅ Nenhum chamado aberto!";
  }

  if (intent === "finance_summary") {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const entries = await prisma.financeEntry.findMany({ where: { date: { gte: monthStart } } });
    const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
    const expense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
    return `💰 *Financeiro do mês:*\nReceitas: R$ ${income.toFixed(2)}\nDespesas: R$ ${expense.toFixed(2)}\nSaldo: R$ ${(income - expense).toFixed(2)}`;
  }

  const summary = await prisma.dailySummary.findFirst({ orderBy: { createdAt: "desc" } });
  return summary ? summary.summary : "Nenhum resumo de grupo disponível ainda.";
}

export interface SelfMessageMeta {
  messageTimestamp: number;
}

export async function handleSelfMessage(joinedText: string, _meta: SelfMessageMeta): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  const providerOpts = getProviderOpts(config);

  let conv = await prisma.conversation.findFirst({
    where: { phone: config.ownerPhone, source: "self" },
    include: { messages: { orderBy: { createdAt: "desc" }, take: config.historyLimit } },
  });

  const recentContext = conv?.messages
    .slice()
    .reverse()
    .map((m) => `${m.role === "user" ? "Dono" : "Secretária"}: ${m.content}`)
    .join("\n");

  const route = await routePersonalMessage(joinedText, config.ownerName, providerOpts, recentContext, config.systemPrompt);

  if (!conv) {
    conv = await prisma.conversation.create({
      data: { phone: config.ownerPhone, source: "self" },
      include: { messages: { orderBy: { createdAt: "desc" }, take: config.historyLimit } },
    });
  }
  await prisma.message.create({ data: { conversationId: conv.id, role: "user", content: joinedText } });

  let response = route.confirmation;

  switch (route.type) {
    case "agenda_add":
      await prisma.agendaItem.create({
        data: {
          source: "self",
          category: route.category,
          title: route.title,
          description: route.description,
          dueDate: route.dueDate ? new Date(route.dueDate) : null,
          rawMessage: joinedText,
        },
      });
      break;
    case "finance":
      await prisma.financeEntry.create({
        data: {
          type: route.financeType,
          amount: route.amount,
          category: route.category,
          subcategory: route.subcategory,
          description: route.description,
          source: "whatsapp",
        },
      });
      break;
    case "diary":
      await prisma.diaryEntry.create({
        data: {
          content: route.content,
          mood: route.mood,
          source: "whatsapp",
        },
      });
      break;
    case "agenda_query":
      response = await buildQueryResponse(route.queryIntent);
      break;
  }

  await prisma.message.create({ data: { conversationId: conv.id, role: "assistant", content: response } });

  if (response) {
    await notifyOwner(config, response);
  }
}

/**
 * Processa um PDF de extrato: extrai todas as transações e lança de uma vez
 * no Financeiro. É um fluxo à parte de handleSelfMessage porque um extrato
 * vira MUITOS lançamentos, não uma classificação única.
 */
export async function handleStatementDocument(statementText: string): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  const providerOpts = getProviderOpts(config);
  const entries = await parseStatementEntries(statementText, providerOpts);

  if (entries.length === 0) {
    await notifyOwner(config, "⚠️ Recebi o PDF mas não consegui identificar nenhuma transação nele.");
    return;
  }

  await prisma.financeEntry.createMany({
    data: entries.map((e) => ({
      type: e.type,
      amount: e.amount,
      category: e.category,
      subcategory: e.subcategory,
      description: e.description,
      date: e.date ? new Date(e.date) : new Date(),
      source: "whatsapp",
    })),
  });

  const total = entries.reduce((s, e) => s + (e.type === "expense" ? e.amount : -e.amount), 0);
  const response = `✅ Importei ${entries.length} lançamento(s) do extrato.\n💰 Total em despesas: R$ ${total.toFixed(2)}`;
  await notifyOwner(config, response);
}

export interface PrivateMessageMeta {
  phone: string;
  pushName: string;
  messageTimestamp: number;
}

export async function handlePrivateMessage(joinedText: string, meta: PrivateMessageMeta): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.enabled) return;

  const providerOpts = getProviderOpts(config);
  const contactName = meta.pushName || meta.phone;

  const analysis = await analyzePrivateMessage(joinedText, contactName, config.ownerRole, providerOpts, config.systemPrompt);

  if (analysis.ticketIds.length > 0) {
    await extractAndSaveTickets(analysis.ticketIds, joinedText, contactName, "", "");
  }

  const briefing = await prisma.briefing.create({
    data: {
      phone: meta.phone,
      contactName,
      rawMessage: joinedText,
      summary: analysis.summary,
      subject: analysis.subject,
      urgency: analysis.urgency,
      receivedAt: new Date(meta.messageTimestamp * 1000),
    },
  });

  let conv = await prisma.conversation.findFirst({ where: { phone: meta.phone, source: "whatsapp" } });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { phone: meta.phone, source: "whatsapp" } });
  }
  await prisma.message.create({ data: { conversationId: conv.id, role: "user", content: joinedText } });

  if (config.ownerPhone && config.evolutionUrl) {
    const hora = formatTime(meta.messageTimestamp);
    const urgencyBadge =
      analysis.urgency === "critical"
        ? "\n🚨 *URGENTE*"
        : analysis.urgency === "high"
        ? "\n⚠️ *IMPORTANTE*"
        : "";

    const notification = `👤 *${contactName}* — 🕐 ${hora}\n\n📋 *${analysis.subject}*\n${analysis.summary}${urgencyBadge}`;

    await notifyOwner(config, notification);
    await prisma.briefing.update({ where: { id: briefing.id }, data: { notified: true } });
  }
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
    groupConfig = await prisma.groupConfig.create({
      data: { groupJid, groupName: groupJid.split("@")[0], active: true },
    });
  }
  if (!groupConfig.active) return;

  const groupName = groupConfig.groupName || groupJid.split("@")[0];

  await prisma.groupMessage.create({
    data: {
      groupJid,
      groupName,
      senderName: meta.senderName,
      content: joinedText,
      receivedAt: new Date(meta.messageTimestamp * 1000),
    },
  });

  let conv = await prisma.conversation.findFirst({ where: { phone: groupJid, source: "group" } });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { phone: groupJid, source: "group" } });
  }
  await prisma.message.create({
    data: { conversationId: conv.id, role: "user", content: `[${meta.senderName}] ${joinedText}` },
  });

  const classification = await classifyGroupMessage(
    joinedText,
    meta.senderName,
    groupName,
    groupConfig.focus,
    config.ownerName,
    config.ownerRole,
    providerOpts,
    config.systemPrompt
  );

  if (classification.ticketIds.length > 0) {
    await extractAndSaveTickets(classification.ticketIds, joinedText, meta.senderName, groupJid, groupName);
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
