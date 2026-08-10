import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bufferMessage } from "@/lib/debounce";
import {
  extractText,
  transcribeIncomingAudio,
  handleSelfMessage,
  handlePrivateMessage,
  handleGroupMessage,
} from "@/lib/message-handlers";

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
    const rawMessage: Record<string, unknown> = data.message ?? {};

    if (!remoteJid) return NextResponse.json({ ok: true });

    const config = await prisma.agentConfig.findFirst();
    if (!config) return NextResponse.json({ ok: true });

    let text = extractText(rawMessage).trim();

    if (!text && rawMessage.audioMessage) {
      if (!config.audioEnabled) return NextResponse.json({ ok: true });
      try {
        text = (
          await transcribeIncomingAudio(
            {
              evolutionUrl: config.evolutionUrl,
              evolutionApiKey: config.evolutionApiKey,
              instanceId: config.instanceId,
            },
            key.id ?? "",
            rawMessage,
            {
              aiProvider: config.aiProvider,
              openaiApiKey: config.openaiApiKey,
              groqApiKey: config.groqApiKey,
            }
          )
        ).trim();
      } catch (err) {
        console.error("[webhook] falha ao transcrever áudio", err);
        return NextResponse.json({ ok: true });
      }
    }

    if (!text) return NextResponse.json({ ok: true });

    const isGroup = remoteJid.endsWith("@g.us");
    const phone = isGroup ? "" : remoteJid.replace("@s.whatsapp.net", "");

    // Conversa com o próprio número: sempre trata como canal pessoal,
    // independente de fromMe (é assim que o dono se auto-alimenta).
    if (!isGroup && config.ownerPhone && phone === config.ownerPhone) {
      bufferMessage(`self:${phone}`, text, { messageTimestamp }, config.debounceSeconds, handleSelfMessage);
      return NextResponse.json({ ok: true });
    }

    // Qualquer outra mensagem enviada pelo próprio dono (respondendo alguém
    // manualmente) não deve virar análise.
    if (fromMe) return NextResponse.json({ ok: true });

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
