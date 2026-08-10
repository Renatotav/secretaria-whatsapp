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
  notifyOwner,
} from "@/lib/message-handlers";
import { extractPdfText } from "@/lib/pdf";
import type { AgentConfig } from "@prisma/client";

let cachedConfig: AgentConfig | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 minuto

async function getCachedConfig(): Promise<AgentConfig | null> {
  const now = Date.now();
  if (cachedConfig && now - lastCacheTime < CACHE_TTL) {
    return cachedConfig;
  }
  cachedConfig = await prisma.agentConfig.findFirst();
  lastCacheTime = now;
  return cachedConfig;
}

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

    const config = await getCachedConfig();
    if (!config) {
      console.log("[webhook] sem AgentConfig salvo, ignorando");
      return NextResponse.json({ ok: true });
    }

    const apiKeyHeader = request.headers.get("apikey");
    if (config.evolutionApiKey && apiKeyHeader !== config.evolutionApiKey) {
      console.error("[webhook] API Key inválida!");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Processamento em background para liberar o 200 OK imediatamente
    processWebhookMessage(config, remoteJid, fromMe, pushName, messageTimestamp, rawMessage, key).catch((err) => {
      console.error("[webhook background error]", err);
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook]", err);
    return NextResponse.json({ ok: true });
  }
}

async function processWebhookMessage(
  config: AgentConfig,
  remoteJid: string,
  fromMe: boolean,
  pushName: string,
  messageTimestamp: number,
  rawMessage: Record<string, unknown>,
  key: Record<string, unknown>
) {
  const isGroup = remoteJid.endsWith("@g.us");
  const phone = isGroup ? "" : remoteJid.replace("@s.whatsapp.net", "");
  const isSelfChat = !isGroup && !!config.ownerPhone && phone === config.ownerPhone;

  const evo = { evolutionUrl: config.evolutionUrl, evolutionApiKey: config.evolutionApiKey, instanceId: config.instanceId };

  const documentMessage = rawMessage.documentMessage as Record<string, unknown> | undefined;
  const documentMimetype = (documentMessage?.mimetype as string) || "";
  if (isSelfChat && documentMessage && documentMimetype.includes("pdf")) {
    console.log("[webhook] PDF recebido no canal pessoal, processando extrato");
    try {
      const { base64 } = await downloadIncomingMedia(evo, (key.id as string) ?? "", rawMessage, "documentMessage", "application/pdf");
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
    return;
  }

  if (isSelfChat && rawMessage.imageMessage) {
    console.log("[webhook] imagem recebida no canal pessoal, processando extrato por visão");
    try {
      const { base64, mimetype } = await downloadIncomingMedia(evo, (key.id as string) ?? "", rawMessage, "imageMessage", "image/jpeg");
      if (base64) {
        await handleStatementImage(base64, mimetype);
      } else {
        console.log("[webhook] imagem sem base64 disponível, avisando");
        await notifyOwner(config, "⚠️ Não consegui baixar essa imagem pra ler. Tenta mandar de novo.");
      }
    } catch (err) {
      console.error("[webhook] falha ao processar imagem", err);
      await notifyOwner(config, `⚠️ Falha ao processar a imagem: ${err instanceof Error ? err.message : "erro desconhecido"}`);
    }
    return;
  }

  let text = extractText(rawMessage).trim();

  if (!text && rawMessage.audioMessage) {
    if (!config.audioEnabled) return;
    try {
      text = (
        await transcribeIncomingAudio(
          evo,
          (key.id as string) ?? "",
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
      return;
    }
  }

  if (!text) {
    console.log("[webhook] sem texto extraído, ignorando");
    return;
  }

  console.log("[webhook] roteando", { phone, ownerPhone: config.ownerPhone, isGroup, isSelf: isSelfChat });

  if (isSelfChat) {
    bufferMessage(`self:${phone}`, text, { messageTimestamp }, config.debounceSeconds, handleSelfMessage);
    return;
  }

  if (fromMe) {
    console.log("[webhook] fromMe=true e não é self-chat, ignorando");
    return;
  }

  if (isGroup) {
    const senderName = pushName || ((key.participant as string) ?? "").replace("@s.whatsapp.net", "");
    bufferMessage(
      `group:${remoteJid}:${senderName}`,
      text,
      { remoteJid, senderName, messageTimestamp },
      config.debounceSeconds,
      handleGroupMessage
    );
    return;
  }

  bufferMessage(
    `private:${phone}`,
    text,
    { phone, pushName, messageTimestamp },
    config.debounceSeconds,
    handlePrivateMessage
  );
}
