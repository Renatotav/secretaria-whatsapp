import { NextResponse } from "next/server";
import { alexaRequestOk, falar, frase, paraFala, type AlexaBody } from "@/lib/alexa-skill";

// Skill "minha secretária": "Alexa, pede pra minha secretária anotar 30 reais
// de mercado no pix". A frase vira mensagem para a secretária (o mesmo caminho
// do WhatsApp: a resposta chega lá também) e a Alexa fala a resposta. A Alexa
// espera ~8 s: se a secretária demorar, ela avisa que responde no WhatsApp.
const ESPERA_MS = 6500;

export async function POST(request: Request) {
  const raw = await request.text();
  let body: AlexaBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "json" }, { status: 400 });
  }
  if (!(await alexaRequestOk(request, raw, body))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tipo = body.request?.type;
  // Diagnóstico: o que a Alexa mandou (tipo, intenção e a frase entendida — é a fala dele, não sai do servidor).
  console.log(`[alexa-skill] ${tipo}${body.request?.intent?.name ? ` ${body.request.intent.name}` : ""}${frase(body) ? `: "${frase(body).slice(0, 120)}"` : ""}`);
  if (tipo === "LaunchRequest") return NextResponse.json(falar("Oi, Renato. O que eu anoto?", false));
  if (tipo === "SessionEndedRequest") return NextResponse.json({ version: "1.0", response: {} });
  const nome = body.request?.intent?.name || "";
  if (nome === "AMAZON.StopIntent" || nome === "AMAZON.CancelIntent" || nome === "AMAZON.NoIntent") return NextResponse.json(falar("Tá bom."));
  if (nome === "AMAZON.HelpIntent")
    return NextResponse.json(falar("Fale, por exemplo: anota trinta reais de mercado no pix. Ou: quanto gastei este mês. Ou: me lembra amanhã às oito de pagar a internet. O que eu faço?", false));

  const texto = frase(body);
  if (!texto) return NextResponse.json(falar("Não entendi. Fale, por exemplo: anota trinta reais de mercado no pix.", false));

  const { replyCapture } = await import("@/lib/reply-capture");
  const { handleSelfMessage } = await import("@/lib/message-handlers");
  const respostas: string[] = [];
  const trabalho = replyCapture.run(respostas, () => handleSelfMessage(texto, { messageTimestamp: Math.floor(Date.now() / 1000) })).catch((err) => {
    console.error("[alexa-skill] falhou", err instanceof Error ? err.message : err);
  });
  console.log("[alexa-skill] pedido por voz");
  // Espera a 1ª resposta (ou o fim) até o limite da Alexa.
  const inicio = Date.now();
  let terminou = false;
  void trabalho.then(() => (terminou = true));
  while (!terminou && !respostas.length && Date.now() - inicio < ESPERA_MS) await new Promise((r) => setTimeout(r, 150));
  if (respostas.length) {
    await new Promise((r) => setTimeout(r, 300)); // às vezes vêm 2 mensagens seguidas
    return NextResponse.json(falar(paraFala(respostas.join("\n")) || "Feito."));
  }
  return NextResponse.json(falar(terminou ? "Feito." : "Tá, já te respondo no WhatsApp."));
}
