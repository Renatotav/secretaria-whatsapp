import { prisma } from "./prisma";

// Vídeo do YouTube pelo WhatsApp: ele manda o link (e, se quiser, uma
// pergunta) e recebe o resumo. O servidor é bloqueado pelo YouTube ("confirme
// que não é robô"), então quem assiste é o Gemini pelo OpenRouter: o Google
// busca o vídeo pelo link e vê imagem e áudio.
//   "<link>"                → título, quem fala e os pontos principais
//   "<link> o que ele fala de X?" → resposta focada
//   "guarda" (até 1 h depois) → salva o último resumo no diário

const LINK = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s]*?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})[^\s]*/i;
const MODELO = "google/gemini-3.8-flash";
/** false = não assiste mais (custo); responde com o caminho do Gemini/NotebookLM. */
const YOUTUBE_PAGO = false;
let ultimo: { at: number; texto: string } | null = null;

export async function applyYoutube(text: string, avisar: (t: string) => Promise<void>): Promise<string | null> {
  const t = text.trim();
  if (/^\s*(guarda|guardar|salva|salvar)(\s+(no|o)\s+di[aá]rio)?\s*[.!]*$/i.test(t) && ultimo && Date.now() - ultimo.at < 3600_000) {
    await prisma.diaryEntry.create({ data: { content: ultimo.texto.slice(0, 8000), source: "youtube" } });
    ultimo = null;
    return "📓 Guardei o resumo do vídeo no seu diário.";
  }
  const m = t.match(LINK);
  if (!m) return null;
  // Desligado a pedido dele (20/10/2026): assistir vídeo pelo OpenRouter gastava
  // crédito demais. Ele usa o Gemini / NotebookLM (grátis) e manda o resumo.
  if (!YOUTUBE_PAGO) {
    return "🎥 Para vídeo do YouTube eu não assisto mais (gastava muito crédito da IA). Abra no *Gemini* ou no *NotebookLM* — é grátis — e me mande o resumo aqui que eu guardo no diário (comece com *diário:*).";
  }
  const id = m[1];
  const pergunta = t.replace(m[0], "").trim();
  const cfg = await prisma.agentConfig.findFirst({ select: { openrouterApiKey: true } });
  if (!cfg?.openrouterApiKey) return "⚠️ Sem chave do OpenRouter para assistir o vídeo.";
  await avisar("🎥 Assistindo o vídeo… (leva de 10 s a 1 min, conforme o tamanho)");
  const instrucao = pergunta
    ? `Assista o vídeo inteiro e responda em português do Brasil, direto e curto, à pergunta: "${pergunta.slice(0, 500)}". Diga o minuto aproximado onde isso aparece. Se o vídeo não falar disso, diga que não fala.`
    : "Assista o vídeo inteiro e responda em português do Brasil, para ler no celular (WhatsApp, sem tabelas): 1) título e quem fala, com a duração aproximada; 2) do que se trata em 2 frases; 3) os 5 pontos principais, um por linha começando com •; 4) ferramentas, links ou passos citados, se houver; 5) uma linha final com o que vale aproveitar. Use *negrito* só nos títulos.";
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.openrouterApiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 3000,
        messages: [{ role: "user", content: [{ type: "text", text: instrucao }, { type: "video_url", video_url: { url: `https://www.youtube.com/watch?v=${id}` } }] }],
      }),
      signal: AbortSignal.timeout(280_000),
    });
    const d = await r.json();
    const texto: string = d?.choices?.[0]?.message?.content?.trim() || "";
    if (!texto) {
      console.error("[youtube] sem resposta", r.status, JSON.stringify(d?.error || {}).slice(0, 200));
      return "⚠️ Não consegui assistir esse vídeo (pode ser privado, muito longo ou com restrição de idade).";
    }
    console.log(`[youtube] ${id} · ${d?.usage?.prompt_tokens ?? "?"} tokens · US$ ${d?.usage?.cost ?? "?"}`);
    ultimo = { at: Date.now(), texto: `🎥 Vídeo: https://youtu.be/${id}\n\n${texto}` };
    return `${texto}\n\n_Quer guardar no diário? Responda *guarda*._`;
  } catch (err) {
    console.error("[youtube] falhou", err instanceof Error ? err.message : err);
    return "⚠️ Demorou demais para assistir. Vídeos muito longos (lives de horas) podem não caber: tente um trecho ou um vídeo menor.";
  }
}
