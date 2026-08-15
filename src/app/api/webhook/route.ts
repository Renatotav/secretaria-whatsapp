import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bufferMessage } from "@/lib/debounce";
import {
  extractText,
  transcribeIncomingAudio,
  downloadIncomingMedia,
  handleSelfMessage,
  handlePrivateMessage,
  handleGroupMessage,
  handleStatementDocument,
  handleStatementImage,
  handleInvoiceImage,
  notifyOwner,
} from "@/lib/message-handlers";
import { extractPdfText } from "@/lib/pdf";

export async function GET() {
  return NextResponse.json({ status: "webhook online" });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[webhook] evento recebido:", body.event);

    if (body.event !== "messages.upsert") {
      return NextResponse.json({ ok: true });
    }

    const data = body.data ?? {};
    const key = data.key ?? {};
    const remoteJid: string = key.remoteJid ?? "";
    const fromMe: boolean = key.fromMe ?? false;
    const pushName: string = data.pushName ?? "";
    const messageTimestamp: number = data.messageTimestamp ?? Math.floor(Date.now() / 1000);
    const rawMessage: Record<string, unknown> = data.message ?? {};

    console.log("[webhook] messages.upsert", { remoteJid, fromMe, pushName, hasAudio: !!rawMessage.audioMessage });

    if (!remoteJid) return NextResponse.json({ ok: true });

    const config = await prisma.agentConfig.findFirst();
    if (!config) {
      console.log("[webhook] sem AgentConfig salvo, ignorando");
      return NextResponse.json({ ok: true });
    }

    const isGroup = remoteJid.endsWith("@g.us");
    const phone = isGroup ? "" : remoteJid.replace("@s.whatsapp.net", "");
    const isSelfChat = !isGroup && !!config.ownerPhone && phone === config.ownerPhone;

    const evo = { evolutionUrl: config.evolutionUrl, evolutionApiKey: config.evolutionApiKey, instanceId: config.instanceId };

    // PDF de extrato: só processado no canal pessoal, vira vários lançamentos
    // de uma vez em vez de passar pela classificação normal de texto.
    const documentMessage = rawMessage.documentMessage as Record<string, unknown> | undefined;
    const documentMimetype = (documentMessage?.mimetype as string) || "";
    if (isSelfChat && documentMessage && documentMimetype.includes("pdf")) {
      console.log("[webhook] PDF recebido no canal pessoal, processando extrato");
      try {
        const { base64 } = await downloadIncomingMedia(evo, key.id ?? "", rawMessage, "documentMessage", "application/pdf");
        const pdfText = base64 ? await extractPdfText(base64) : "";
        if (!pdfText) {
          console.log("[webhook] PDF sem texto extraível, avisando pra mandar print");
          await notifyOwner(
            config,
            "⚠️ Não consegui ler o texto desse PDF (fatura sem camada de texto). Manda um print/foto de cada página em vez do arquivo."
          );
        } else {
          await handleStatementDocument(pdfText);
        }
      } catch (err) {
        console.error("[webhook] falha ao processar PDF", err);
        await notifyOwner(config, `⚠️ Falha ao processar o PDF: ${err instanceof Error ? err.message : "erro desconhecido"}`);
      }
      return NextResponse.json({ ok: true });
    }

    // Foto/print de extrato OU nota fiscal: lida por visão em vez de texto —
    // cobre PDFs sem texto extraível e quem já manda print direto ou nota fiscal.
    if (isSelfChat && rawMessage.imageMessage) {
      const caption = ((rawMessage.imageMessage as Record<string, string>).caption || "").toLowerCase();
      const isInvoice = caption.includes("nota") || caption.includes("mercado") || caption.includes("fatura") || caption.includes("recibo");
      
      console.log(`[webhook] imagem recebida no canal pessoal (isInvoice=${isInvoice})`);
      try {
        const { base64, mimetype } = await downloadIncomingMedia(evo, key.id ?? "", rawMessage, "imageMessage", "image/jpeg");
        if (base64) {
          if (isInvoice) {
            await handleInvoiceImage(base64, mimetype, caption);
          } else {
            await handleStatementImage(base64, mimetype);
          }
        } else {
          console.log("[webhook] imagem sem base64 disponível, avisando");
          await notifyOwner(config, "⚠️ Não consegui baixar essa imagem pra ler. Tenta mandar de novo.");
        }
      } catch (err) {
        console.error("[webhook] falha ao processar imagem", err);
        await notifyOwner(config, `⚠️ Falha ao processar a imagem: ${err instanceof Error ? err.message : "erro desconhecido"}`);
      }
      return NextResponse.json({ ok: true });
    }

    let text = extractText(rawMessage).trim();

    if (!text && rawMessage.audioMessage) {
      if (!config.audioEnabled) return NextResponse.json({ ok: true });
      try {
        text = (
          await transcribeIncomingAudio(
            evo,
            key.id ?? "",
            rawMessage,
            {
              aiProvider: config.aiProvider,
              openaiApiKey: config.openaiApiKey,
              groqApiKey: config.groqApiKey,
              openrouterApiKey: config.openrouterApiKey,
            }
          )
        ).trim();
      } catch (err) {
        console.error("[webhook] falha ao transcrever áudio", err);
        return NextResponse.json({ ok: true });
      }
    }

    if (!text) {
      console.log("[webhook] sem texto extraído, ignorando");
      return NextResponse.json({ ok: true });
    }

    console.log("[webhook] roteando", { phone, ownerPhone: config.ownerPhone, isGroup, isSelf: isSelfChat });

    // Conversa com o próprio número: sempre trata como canal pessoal,
    // independente de fromMe (é assim que o dono se auto-alimenta).
    if (isSelfChat) {
      bufferMessage(`self:${phone}`, text, { messageTimestamp }, config.debounceSeconds, handleSelfMessage);
      return NextResponse.json({ ok: true });
    }

    // Qualquer outra mensagem enviada pelo próprio dono (respondendo alguém
    // manualmente) não deve virar análise.
    if (fromMe) {
      console.log("[webhook] fromMe=true e não é self-chat, ignorando");
      return NextResponse.json({ ok: true });
    }

    if (isGroup) {
      const senderName = pushName || (key.participant ?? "").replace("@s.whatsapp.net", "");
      bufferMessage(
        `group:${remoteJid}:${senderName}`,
        text,
        { remoteJid, senderName, messageTimestamp },
        config.debounceSeconds,
        handleGroupMessage
      );
      return NextResponse.json({ ok: true });
    }

    bufferMessage(
      `private:${phone}`,
      text,
      { phone, pushName, messageTimestamp },
      config.debounceSeconds,
      handlePrivateMessage
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook]", err);
    return NextResponse.json({ ok: true });
  }
}
