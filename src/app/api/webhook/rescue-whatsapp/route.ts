import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { routePersonalMessage } from "@/lib/personal-router";
import { projectAndInsertFinanceEntries } from "@/lib/message-handlers";

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const config = await prisma.agentConfig.findFirst();
    if (!config || !config.ownerPhone) {
      return NextResponse.json({ error: "Configuração não encontrada" }, { status: 404 });
    }

    const jid = `${config.ownerPhone}@s.whatsapp.net`;
    const url = `${config.evolutionUrl}/chat/findMessages/${config.instanceId}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": config.evolutionApiKey
      },
      body: JSON.stringify({
        where: { key: { remoteJid: jid } }
      })
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Erro na Evolution API", details: await res.text() }, { status: 500 });
    }

    const data = await res.json();
    let messages: any[] = [];
    if (Array.isArray(data)) messages = data;
    else if (Array.isArray(data?.messages)) messages = data.messages;
    else if (Array.isArray(data?.records)) messages = data.records;
    else if (Array.isArray(data?.messages?.records)) messages = data.messages.records;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ success: true, message: "Nenhuma mensagem encontrada no WhatsApp.", data });
    }

    // Dispara o processamento em background (fire and forget)
    (async () => {
      let processed = 0;
      let inserted = 0;
      
      // Evolution API pode retornar as mensagens da mais nova para a mais antiga. Vamos inverter para processar as velhas primeiro.
      const sorted = [...messages].reverse();

      for (const msg of sorted) {
        // Ignora as mensagens que a IA enviou (fromMe: true)
        if (msg.key?.fromMe) continue;

        let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";
        if (!text && msg.message?.imageMessage?.caption) {
           text = msg.message.imageMessage.caption;
        }

        if (!text) continue;

        try {
          const providerOpts = {
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
          
          const result = await routePersonalMessage(text, config.ownerName, providerOpts, "", "", config.creditCardDueDay);

          if (result.type === "finance") {
            const entry = {
              date: result.date || null,
              purchaseDate: result.purchaseDate || undefined,
              description: result.description,
              amount: result.amount,
              type: result.financeType,
              category: result.category,
              subcategory: result.subcategory,
              paymentMethod: result.paymentMethod || "pix",
              status: result.status || "paid",
            };
            
            await projectAndInsertFinanceEntries([entry], "whatsapp", config.creditCardDueDay);
            inserted++;
          }
          processed++;
          
          // Pausa de 1 segundo entre mensagens para não dar rate limit nas APIs de IA
          await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
          console.error("Erro ao processar mensagem no resgate:", text, e);
        }
      }
      console.log(`[RESCUE] Processadas ${processed} mensagens. Inseridas ${inserted} entradas financeiras.`);
    })();

    return NextResponse.json({ 
      success: true, 
      message: `Iniciamos o resgate de ${messages.length} mensagens no fundo! Suas despesas do WhatsApp começarão a aparecer no painel em alguns minutos.` 
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
