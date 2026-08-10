import { prisma } from "./prisma";
import { sendTextWithTyping, getBase64FromMediaMessage, fetchGroupInfo } from "./evolution";
import { transcribeAudio, type ProviderOptions } from "./openai";
import { analyzePrivateMessage } from "./analyzer";
import { classifyGroupMessage } from "./classifier";
import {
  routePersonalMessage,
  parseStatementEntries,
  parseStatementImage,
  type PersonalQueryIntent,
  type StatementEntry,
} from "./personal-router";
import { extractAndSaveTickets } from "./ticket-extractor";
import { parseLocalDate } from "./dates";
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
  const d = new Date(ts * 1000);
  let h = d.getUTCHours() - 3;
  if (h < 0) h += 24;
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${m}`;
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

export async function notifyOwner(config: AgentConfig, text: string): Promise<void> {
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
export async function downloadIncomingMedia(
  evo: { evolutionUrl: string; evolutionApiKey: string; instanceId: string },
  messageId: string,
  message: Record<string, unknown>,
  field: "documentMessage" | "imageMessage",
  defaultMimetype: string
): Promise<{ base64: string; mimetype: string }> {
  const mediaMessage = (message[field] as Record<string, unknown>) ?? {};
  let base64 = (message.base64 as string) || (mediaMessage.base64 as string) || "";
  let mimetype = (mediaMessage.mimetype as string) || defaultMimetype;

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
      if (route.installments) {
        // Compra parcelada relatada por mensagem (não veio de extrato) — usa
        // o mesmo formato "Parcela X/Y (compra em DD/MM)" pra reaproveitar a
        // projeção/dedupe de saveStatementEntries em vez de duplicar a lógica.
        const today = new Date();
        const compraEm = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}`;
        await saveStatementEntries(
          config,
          [
            {
              date: today.toISOString(),
              description: `${route.description} - Parcela 1/${route.installments} (compra em ${compraEm})`,
              amount: route.amount,
              type: route.financeType,
              category: route.category,
              subcategory: route.subcategory,
            },
          ],
          "a mensagem"
        );
        response = "";
      } else {
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
      }
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
 * Detecta "Parcela X/Y" (e opcionalmente "(compra em DD/MM)") numa descrição
 * — seja gerada pelo parser de extrato ou digitada à mão pelo usuário direto
 * no campo de edição — e devolve a descrição "base" sem esses pedaços (pra
 * comparar entradas da mesma compra parcelada entre si). Se a descrição não
 * tiver "(compra em DD/MM)" explícito, usa a data do próprio lançamento
 * (fallbackDate) como referência — é o caso de quem só digita "Parcela 3/12"
 * na edição, sem se preocupar com a data original da compra.
 */
function parseInstallmentInfo(
  description: string,
  fallbackDate?: Date
): { current: number; total: number; purchaseDate: string; baseDescription: string } | null {
  const parcelaMatch = description.match(/Parcela (\d+)\/(\d+)/);
  if (!parcelaMatch) return null;
  const compraMatch = description.match(/\(compra em (\d{2})\/(\d{2})\)/);

  const baseDescription = description
    .replace(/\s*-?\s*Parcela \d+\/\d+/, "")
    .replace(/\s*\(compra em \d{2}\/\d{2}\)/, "")
    .replace(/\s*\(previsto\)/, "")
    .trim();

  const purchaseDate = compraMatch
    ? `${compraMatch[2]}-${compraMatch[1]}` // MM-DD, estável entre reimportações
    : fallbackDate
    ? `${String(fallbackDate.getMonth() + 1).padStart(2, "0")}-${String(fallbackDate.getDate()).padStart(2, "0")}`
    : null;
  if (!purchaseDate) return null;

  return {
    current: Number(parcelaMatch[1]),
    total: Number(parcelaMatch[2]),
    purchaseDate,
    baseDescription,
  };
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function installmentKey(baseDescription: string, purchaseDate: string, total: number, amount: number, targetDate: Date): string {
  return `${baseDescription}|${purchaseDate}|${total}|${amount.toFixed(2)}|${targetDate.getFullYear()}-${targetDate.getMonth()}`;
}

function subscriptionKey(description: string, amount: number, targetDate: Date): string {
  return `sub|${description}|${amount.toFixed(2)}|${targetDate.getFullYear()}-${targetDate.getMonth()}`;
}

const SUBSCRIPTION_PROJECTION_MONTHS = 11;

/**
 * Núcleo compartilhado: expande parcelas restantes e assinaturas recorrentes
 * em entradas futuras "(previsto)", dedupe contra o banco, e insere o que é
 * novo. Não notifica o dono — quem chama decide se/como avisar (o fluxo de
 * extrato via WhatsApp avisa; edição manual no painel não precisa).
 */
export async function projectAndInsertFinanceEntries(
  entries: StatementEntry[],
  source: "whatsapp" | "dashboard" = "whatsapp"
): Promise<{ toInsert: StatementEntry[]; duplicates: number; projected: number }> {
  // Junta as parcelas restantes (ex: Parcela 6/10 vira também 7/10..10/10 em
  // meses futuros) e assinaturas recorrentes (categoria "Assinaturas" sem
  // parcela — ex: Anthropic, Netflix) com as entradas reais desse extrato,
  // pra já projetar o fluxo de caixa dos próximos meses.
  const candidates: { entry: StatementEntry; date: Date; key: string | null }[] = [];

  for (const e of entries) {
    const baseDate = parseLocalDate(e.date);
    const info = parseInstallmentInfo(e.description, baseDate);

    if (info) {
      candidates.push({
        entry: e,
        date: baseDate,
        key: installmentKey(info.baseDescription, info.purchaseDate, info.total, e.amount, baseDate),
      });
      if (info.current < info.total) {
        for (let i = info.current + 1; i <= info.total; i++) {
          const futureDate = addMonths(baseDate, i - info.current);
          const futureDescription = `${info.baseDescription} - Parcela ${i}/${info.total} (compra em ${info.purchaseDate.split("-")[1]}/${info.purchaseDate.split("-")[0]}) (previsto)`;
          candidates.push({
            entry: { ...e, description: futureDescription, date: futureDate.toISOString() },
            date: futureDate,
            key: installmentKey(info.baseDescription, info.purchaseDate, info.total, e.amount, futureDate),
          });
        }
      }
    } else if (e.category === "Assinaturas" || /\(recorrente\)/.test(e.description)) {
      // Assinatura (categoria "Assinaturas") ou qualquer lançamento marcado
      // "(recorrente)" pelo usuário (ex: salário) = repete todo mês, sem fim
      // previsto. Projeta um horizonte fixo; cada reimportação/edição futura
      // da mesma entrada estende a janela pra frente automaticamente.
      // Cancelar é só apagar a entrada daquele mês específico na tabela.
      const baseDescription = e.description.replace(/\s*\(recorrente\)/, "").trim();
      candidates.push({
        entry: { ...e, description: baseDescription },
        date: baseDate,
        key: subscriptionKey(baseDescription, e.amount, baseDate),
      });
      for (let i = 1; i <= SUBSCRIPTION_PROJECTION_MONTHS; i++) {
        const futureDate = addMonths(baseDate, i);
        candidates.push({
          entry: { ...e, description: `${baseDescription} (previsto)`, date: futureDate.toISOString() },
          date: futureDate,
          key: subscriptionKey(baseDescription, e.amount, futureDate),
        });
      }
    } else {
      candidates.push({ entry: e, date: baseDate, key: null });
    }
  }

  // Dedupe contra o que já existe no banco (de uma importação anterior, real
  // ou projetada) e dentro do próprio lote que acabou de ser montado.
  const existing = await prisma.financeEntry.findMany({
    where: {
      OR: [
        { description: { contains: "Parcela " } },
        { category: "Assinaturas" },
        { description: { contains: "(recorrente)" } },
      ],
    },
    select: { description: true, date: true, amount: true, category: true },
  });
  const existingKeys = new Set(
    existing
      .map((e) => {
        const info = parseInstallmentInfo(e.description, e.date);
        if (info) return installmentKey(info.baseDescription, info.purchaseDate, info.total, e.amount, e.date);
        if (e.category === "Assinaturas" || /\(recorrente\)/.test(e.description)) {
          const baseDescription = e.description.replace(/\s*\(previsto\)/, "").replace(/\s*\(recorrente\)/, "").trim();
          return subscriptionKey(baseDescription, e.amount, e.date);
        }
        return null;
      })
      .filter((k): k is string => k !== null)
  );

  const toInsert: StatementEntry[] = [];
  let duplicates = 0;
  let projected = 0;
  const seenThisBatch = new Set<string>();

  for (const c of candidates) {
    if (c.key) {
      if (existingKeys.has(c.key) || seenThisBatch.has(c.key)) {
        duplicates++;
        continue;
      }
      seenThisBatch.add(c.key);
    }
    if (c.entry.description.includes("(previsto)")) projected++;
    toInsert.push(c.entry);
  }

  if (toInsert.length > 0) {
    await prisma.financeEntry.createMany({
      data: toInsert.map((e) => ({
        type: e.type,
        amount: e.amount,
        category: e.category,
        subcategory: e.subcategory,
        description: e.description,
        date: parseLocalDate(e.date),
        source,
      })),
    });
  }

  return { toInsert, duplicates, projected };
}

export async function saveStatementEntries(config: AgentConfig, entries: StatementEntry[], sourceLabel: string): Promise<void> {
  if (entries.length === 0) {
    await notifyOwner(config, `⚠️ Recebi ${sourceLabel} mas não consegui identificar nenhuma transação.`);
    return;
  }

  const { toInsert, duplicates, projected } = await projectAndInsertFinanceEntries(entries, "whatsapp");

  if (toInsert.length === 0) {
    await notifyOwner(config, `⚠️ Recebi ${sourceLabel}, mas todas as transações já tinham sido importadas antes.`);
    return;
  }

  const real = toInsert.length - projected;
  const total = toInsert
    .filter((e) => !e.description.includes("(previsto)"))
    .reduce((s, e) => s + (e.type === "expense" ? e.amount : -e.amount), 0);

  let response = `✅ Importei ${real} lançamento(s) do extrato.\n💰 Total em despesas: R$ ${total.toFixed(2)}`;
  if (projected > 0) response += `\n📅 +${projected} parcela(s) futura(s) projetada(s) nos próximos meses.`;
  if (duplicates > 0) response += `\n♻️ ${duplicates} já estavam lançadas (ignoradas pra não duplicar).`;
  await notifyOwner(config, response);
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
  const entries = await parseStatementEntries(statementText, providerOpts, config.ownerName);
  await saveStatementEntries(config, entries, "o PDF");
}

/**
 * Igual a handleStatementDocument, mas a partir de uma foto/print de extrato
 * — usado quando o PDF não tem texto extraível ou quando o usuário manda a
 * imagem direto.
 */
export async function handleStatementImage(base64: string, mimetype: string): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  const providerOpts = getProviderOpts(config);
  const entries = await parseStatementImage(base64, mimetype, providerOpts, config.ownerName);
  await saveStatementEntries(config, entries, "a imagem");
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
    let newGroupName = groupJid.split("@")[0];
    if (config.evolutionUrl && config.evolutionApiKey && config.instanceId) {
      const info = await fetchGroupInfo(config.evolutionUrl, config.evolutionApiKey, config.instanceId, groupJid);
      if (info?.subject) {
        newGroupName = info.subject;
      }
    }
    groupConfig = await prisma.groupConfig.create({
      data: { groupJid, groupName: newGroupName, active: true },
    });
  } else if (/^\d+$/.test(groupConfig.groupName)) {
    // Grupo antigo que só tem o JID numérico como nome. Tenta atualizar.
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

      const notification = `👥 *${groupName}*\n👤 ${meta.senderName} — 🕐 ${hora}\n\n📌 *${classification.title}*\n${classification.description}${classification.dueDate ? `\n📅 ${new Date(classification.dueDate).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}\n${categoryBadge}`;

      await notifyOwner(config, notification);
      await prisma.agendaItem.update({ where: { id: agendaItem.id }, data: { notified: true } });
    }
  }
}
