import { NextResponse } from "next/server";
import { alexaRequestOk, falar, frase, vozDaResposta, semInvocacao, FIM_RE, type AlexaBody } from "@/lib/alexa-skill";
import { replyCapture } from "@/lib/reply-capture";
import { handleSelfMessage, spokenAnswer } from "@/lib/message-handlers";

/** Responde e continua ouvindo (conversa contínua até "não"/"tchau"). */
const continua = (texto: string) => {
  const r = falar(`${texto.replace(/\s+$/, "")} Mais alguma coisa?`, false);
  r.response.reprompt = { outputSpeech: { type: "PlainText", text: "Quer mais alguma coisa?" } };
  return r;
};

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
  const entendeu = frase(body);
  console.log(`[alexa-skill] ${tipo}${body.request?.intent?.name ? ` ${body.request.intent.name}` : ""}${entendeu ? `: "${entendeu.slice(0, 120)}"` : ""}`);
  if (tipo === "LaunchRequest") return NextResponse.json(falar("Oi, Renato. O que eu anoto?", false));
  if (tipo === "SessionEndedRequest") return NextResponse.json({ version: "1.0", response: {} });
  const nome = body.request?.intent?.name || "";
  if (nome === "AMAZON.StopIntent" || nome === "AMAZON.CancelIntent" || nome === "AMAZON.NoIntent") return NextResponse.json(falar("Tá bom. Até mais!"));
  if (nome === "AMAZON.HelpIntent")
    return NextResponse.json(falar("Fale, por exemplo: anota trinta reais de mercado no pix. Ou: quanto gastei este mês. Ou: me lembra amanhã às oito de pagar a internet. O que eu faço?", false));

  const bruto = frase(body);
  if (!bruto) return NextResponse.json(falar("Não entendi. Fale, por exemplo: anota trinta reais de mercado no pix.", false));
  const texto = semInvocacao(bruto);
  if (FIM_RE.test(texto)) return NextResponse.json(falar("Tá bom. Até mais!"));

  // Pergunta com fala pronta (gasto do dia, resumo do mês): responde curto e natural.
  {
    const fala = await spokenAnswer(texto).catch(() => null);
    if (fala) {
      console.log(`[alexa-skill] respondeu (fala pronta): "${fala.slice(0, 80)}"`);
      return NextResponse.json(continua(fala));
    }
  }
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
    const voz = vozDaResposta(respostas.join("\n")) || "Feito.";
    console.log(`[alexa-skill] respondeu: "${voz.slice(0, 80)}"`);
    return NextResponse.json(continua(voz));
  }
  console.log(`[alexa-skill] ${terminou ? "terminou sem resposta" : "demorou: respondo no WhatsApp"}`);
  return NextResponse.json(terminou ? continua("Feito.") : falar("Tá, já te respondo no WhatsApp."));
}
