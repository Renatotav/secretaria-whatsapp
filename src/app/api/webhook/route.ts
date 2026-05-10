import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/evolution";
import { analyzePrivateMessage } from "@/lib/analyzer";
import { classifyGroupMessage } from "@/lib/classifier";
import { parsePersonalMessage } from "@/lib/agenda-parser";
import { extractAndSaveTickets } from "@/lib/ticket-extractor";
import type { ProviderOptions } from "@/lib/openai";

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractText(message: Record<string, unknown>): string {
  return (
    (message.conversation as string) ??
    (message.extendedTextMessage as Record<string, string>)?.text ??
    (message.imageMessage as Record<string, string>)?.caption ??
    ""
  );
}

async function getNextRepCode(): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const todayStart = new Date(today + "T00:00:00Z");
  const count = await prisma.pendingReply.count({
    where: { createdAt: { gte: todayStart } },
  });
  return `REP-${String(count + 1).padStart(3, "0")}`;
}

export async function GET() {
  return NextResponse.json({ status: "webhook online" });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.event !== "messages.upsert") {
      return NextResponse.json({ ok: true });
    }

    const data = body.data ?? {};
    const key = data.key ?? {};
    const remoteJid: string = key.remoteJid ?? "";
    const fromMe: boolean = key.fromMe ?? false;
    const pushName: string = data.pushName ?? "";
    const messageTimestamp: number = data.messageTimestamp ?? Math.floor(Date.now() / 1000);
    const text = extractText(data.message ?? {}).trim();

    if (!text) return NextResponse.json({ ok: true });

    const config = await prisma.agentConfig.findFirst();
    if (!config) return NextResponse.json({ ok: true });

    const providerOpts: ProviderOptions = {
      aiProvider: config.aiProvider,
      openaiApiKey: config.openaiApiKey,
      openaiModel: config.openaiModel,
      groqApiKey: config.groqApiKey,
      groqModel: config.groqModel,
    };
    const evo = {
      evolutionUrl: config.evolutionUrl,
      evolutionApiKey: config.evolutionApiKey,
      instanceId: config.instanceId,
    };

    const isGroup = remoteJid.endsWith("@g.us");
    const phone = isGroup ? "" : remoteJid.replace("@s.whatsapp.net", "");

    // ── Handle REP-XXX approval (fromMe messages) ──
    if (fromMe) {
      const repMatch = text.match(/^REP-(\d+)$/i);
      if (repMatch) {
        const code = text.toUpperCase();
        const pending = await prisma.pendingReply.findUnique({ where: { code } });
        if (pending && !pending.used && new Date() < pending.expiresAt) {
          await sendWhatsAppMessage(
            evo.evolutionUrl,
            evo.evolutionApiKey,
            evo.instanceId,
            pending.targetPhone,
            pending.suggestion
          );
          await prisma.pendingReply.update({
            where: { id: pending.id },
            data: { used: true },
          });
          if (pending.targetType === "private") {
            await prisma.briefing.updateMany({
              where: { id: pending.sourceId },
              data: { replied: true },
            });
          } else {
            await prisma.agendaItem.updateMany({
              where: { id: pending.sourceId },
              data: { replied: true },
            });
          }
        }
      }
      return NextResponse.json({ ok: true });
    }

    // ── Message to self (owner sends to own number) ──
    if (!isGroup && phone === config.ownerPhone && config.ownerPhone) {
      const parsed = await parsePersonalMessage(text, config.ownerName, providerOpts);

      if (parsed.type === "add") {
        await prisma.agendaItem.create({
          data: {
            source: "self",
            category: parsed.category,
            title: parsed.title,
            description: parsed.description,
            dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
            rawMessage: text,
          },
        });
        if (config.ownerPhone && evo.evolutionUrl) {
          await sendWhatsAppMessage(
            evo.evolutionUrl,
            evo.evolutionApiKey,
            evo.instanceId,
            config.ownerPhone,
            parsed.confirmation
          );
        }
      } else {
        // query
        let response = "";
        if (parsed.queryIntent === "pending_today") {
          const items = await prisma.agendaItem.findMany({
            where: { done: false },
            orderBy: { createdAt: "asc" },
            take: 10,
          });
          response = items.length
            ? `📋 *Pendências:*\n${items.map((i) => `• ${i.title}`).join("\n")}`
            : "✅ Nenhuma pendência no momento!";
        } else if (parsed.queryIntent === "open_tickets") {
          const tickets = await prisma.ticket.findMany({
            where: { status: "open" },
            orderBy: { lastSeen: "desc" },
            take: 10,
          });
          response = tickets.length
            ? `🎫 *Chamados abertos:*\n${tickets.map((t) => `• ${t.ticketId} — ${t.groupName}`).join("\n")}`
            : "✅ Nenhum chamado aberto!";
        } else {
          response = parsed.confirmation;
        }
        if (response && config.ownerPhone && evo.evolutionUrl) {
          await sendWhatsAppMessage(
            evo.evolutionUrl,
            evo.evolutionApiKey,
            evo.instanceId,
            config.ownerPhone,
            response
          );
        }
      }

      return NextResponse.json({ ok: true });
    }

    // ── Private message from contact ──
    if (!isGroup) {
      if (!config.enabled) return NextResponse.json({ ok: true });

      const contactName = pushName || phone;
      const analysis = await analyzePrivateMessage(
        text,
        contactName,
        config.ownerRole,
        providerOpts
      );

      if (analysis.ticketIds.length > 0) {
        await extractAndSaveTickets(analysis.ticketIds, text, contactName, "", "");
      }

      const briefing = await prisma.briefing.create({
        data: {
          phone,
          contactName,
          rawMessage: text,
          summary: analysis.summary,
          subject: analysis.subject,
          urgency: analysis.urgency,
          suggestion: analysis.suggestion,
          receivedAt: new Date(messageTimestamp * 1000),
        },
      });

      // Save to conversation
      let conv = await prisma.conversation.findFirst({ where: { phone, source: "whatsapp" } });
      if (!conv) {
        conv = await prisma.conversation.create({ data: { phone, source: "whatsapp" } });
      }
      await prisma.message.create({
        data: { conversationId: conv.id, role: "user", content: text },
      });

      // Notify owner
      if (config.ownerPhone && evo.evolutionUrl) {
        const hora = formatTime(messageTimestamp);
        const urgencyBadge =
          analysis.urgency === "critical"
            ? "\n🚨 *URGENTE*"
            : analysis.urgency === "high"
            ? "\n⚠️ *IMPORTANTE*"
            : "";

        let notification = `👤 *${contactName}* — 🕐 ${hora}

📋 *${analysis.subject}*
${analysis.summary}${urgencyBadge}`;

        let repCode = "";
        if (analysis.suggestion) {
          repCode = await getNextRepCode();
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await prisma.pendingReply.create({
            data: {
              code: repCode,
              targetPhone: phone,
              targetType: "private",
              suggestion: analysis.suggestion,
              sourceId: briefing.id,
              expiresAt,
            },
          });
          notification += `

💬 *Sugestão:*
"${analysis.suggestion}"

↩️ Digite *${repCode}* aqui para enviar
✏️ Ou responda diretamente no contato`;
        }

        await sendWhatsAppMessage(
          evo.evolutionUrl,
          evo.evolutionApiKey,
          evo.instanceId,
          config.ownerPhone,
          notification
        );

        await prisma.briefing.update({
          where: { id: briefing.id },
          data: { notified: true, repCode },
        });
      }

      return NextResponse.json({ ok: true });
    }

    // ── Group message ──
    if (isGroup) {
      const groupJid = remoteJid;
      const senderName = pushName || (key.participant ?? "").replace("@s.whatsapp.net", "");

      let groupConfig = await prisma.groupConfig.findUnique({ where: { groupJid } });
      if (!groupConfig) {
        groupConfig = await prisma.groupConfig.create({
          data: { groupJid, groupName: groupJid.split("@")[0], active: true },
        });
      }
      if (!groupConfig.active) return NextResponse.json({ ok: true });

      const groupName = groupConfig.groupName || groupJid.split("@")[0];

      await prisma.groupMessage.create({
        data: {
          groupJid,
          groupName,
          senderName,
          content: text,
          receivedAt: new Date(messageTimestamp * 1000),
        },
      });

      let conv = await prisma.conversation.findFirst({ where: { phone: groupJid, source: "group" } });
      if (!conv) {
        conv = await prisma.conversation.create({ data: { phone: groupJid, source: "group" } });
      }
      await prisma.message.create({
        data: { conversationId: conv.id, role: "user", content: `[${senderName}] ${text}` },
      });

      const classification = await classifyGroupMessage(
        text,
        senderName,
        groupName,
        groupConfig.focus,
        config.ownerName,
        config.ownerRole,
        providerOpts
      );

      if (classification.ticketIds.length > 0) {
        await extractAndSaveTickets(classification.ticketIds, text, senderName, groupJid, groupName);
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
            senderName,
            rawMessage: text,
            suggestion: classification.suggestion,
          },
        });

        if (config.ownerPhone && evo.evolutionUrl) {
          const hora = formatTime(messageTimestamp);
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

          let notification = `👥 *${groupName}*
👤 ${senderName} — 🕐 ${hora}

📌 *${classification.title}*
${classification.description}${classification.dueDate ? `\n📅 ${new Date(classification.dueDate).toLocaleDateString("pt-BR")}` : ""}
${categoryBadge}`;

          let repCode = "";
          if (classification.suggestion) {
            repCode = await getNextRepCode();
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await prisma.pendingReply.create({
              data: {
                code: repCode,
                targetPhone: groupJid,
                targetType: "group",
                suggestion: classification.suggestion,
                sourceId: agendaItem.id,
                expiresAt,
              },
            });
            notification += `

💬 *Sugestão:*
"${classification.suggestion}"

↩️ Digite *${repCode}* aqui para enviar
✏️ Ou responda diretamente no grupo`;
          }

          await sendWhatsAppMessage(
            evo.evolutionUrl,
            evo.evolutionApiKey,
            evo.instanceId,
            config.ownerPhone,
            notification
          );

          await prisma.agendaItem.update({
            where: { id: agendaItem.id },
            data: { notified: true, repCode },
          });
        }
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook]", err);
    return NextResponse.json({ ok: true });
  }
}
