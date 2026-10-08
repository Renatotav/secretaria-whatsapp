import OpenAI from "openai";
import { prisma } from "./prisma";
import { normalizeTicketId } from "./work-privacy";

// IA da Central do Atendente: os botões das skills na extensão respondem ali
// mesmo. Usa a chave do OpenRouter que já está na secretária (a chave nunca
// vai para o computador do Tribunal). As instruções de cada skill ficam no
// banco (WorkSkill). Nada do texto enviado é gravado.

export const WORK_SKILLS: Record<string, string> = {
  resumo: "Resumir erro",
  redmine: "Preparar Redmine",
  whatsapp: "Registrar WhatsApp",
  corrigir: "Corrigir texto",
  "corrigir-whatsapp": "Corrigir mensagem",
};

// Para quando a skill ainda não foi cadastrada no banco.
const FALLBACK: Record<string, string> = {
  resumo:
    "Você ajuda um atendente do suporte do PJe (TJCE). Leia o chamado e responda em português, curto:\n" +
    "1) Tipo do erro em uma frase (ex: \"Erro de protocolo no PJe 1º Grau\").\n2) Resumo do problema em até 3 linhas.\n" +
    "3) Próximo passo sugerido em 1 linha. Não invente dados que não estão no texto.",
};

const MAX_TEXT = 20_000;

export interface WorkAiResult {
  text: string;
  model: string;
  tokens: { input: number; output: number };
}

// Vale para todas as skills (pedido do dono): terminologia de trabalho é intocável.
const PRESERVE =
  "REGRA QUE VALE ACIMA DE TODAS: não invente nada e não tire nada. Preserve exatamente os termos de trabalho — " +
  "nomes de sistemas e módulos (PJe, PJe 1º Grau/2º Grau, Assyst, Redmine, SAJ, SAJMP, SOAPUI, MongoDB), nomes de tarefas e " +
  "fluxos (inclusive entre colchetes), siglas, códigos, números de processo, de chamado, de Redmine e de documento, datas, horários, " +
  "nomes de pessoas e de órgãos. Ao corrigir o português (ortografia, acentuação, concordância, regência, crase, pontuação), " +
  "não mude o sentido nem acrescente fatos. Na dúvida entre melhorar e preservar, preserve.";

export async function runWorkSkill(key: string, text: string, ticketRaw?: string, plain = false): Promise<WorkAiResult> {
  if (!WORK_SKILLS[key]) throw new Error("Skill desconhecida");
  const input = (text || "").trim();
  if (!input) throw new Error("Selecione ou cole o texto primeiro.");
  if (input.length > MAX_TEXT) throw new Error(`Texto grande demais (máx. ${MAX_TEXT.toLocaleString("pt-BR")} caracteres).`);

  const config = await prisma.agentConfig.findFirst({ select: { openrouterApiKey: true, workAiModel: true } });
  if (!config?.openrouterApiKey) throw new Error("A secretária está sem chave do OpenRouter (Configurações).");
  const skill = await prisma.workSkill.findUnique({ where: { key } });
  const instructions = skill?.prompt || FALLBACK[key];
  if (!instructions) throw new Error(`A skill "${WORK_SKILLS[key]}" ainda não foi cadastrada.`);

  // Contexto do chamado (o que a secretária sabe dele), quando houver número.
  // Só para quem usa o contexto; os corretores recebem o texto puro.
  const usesContext = key === "resumo" || key === "redmine" || key === "whatsapp";
  let context = "";
  if (ticketRaw && usesContext) {
    const t = await prisma.workTicket.findUnique({
      where: { ticketId: normalizeTicketId(ticketRaw) },
      select: { ticketId: true, status: true, errorType: true, origin: true, redmine: true, redmineStatus: true, queue: true },
    });
    if (t)
      context = `\n\nContexto (só para você entender; NÃO copie nem corrija isto na resposta) — dados do chamado ${t.ticketId} na Central: status ${t.status}${t.errorType ? `, tipo ${t.errorType}` : ""}${t.origin ? `, usuário ${t.origin}` : ""}${t.queue ? `, fila ${t.queue}` : ""}${t.redmine ? `, Redmine ${t.redmine}${t.redmineStatus ? ` (${t.redmineStatus})` : ""}` : ""}.`;
  }

  const model = config.workAiModel || "anthropic/claude-sonnet-5.5";
  const client = new OpenAI({ apiKey: config.openrouterApiKey, baseURL: "https://openrouter.ai/api/v1" });
  const res = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 2500,
    messages: [
      {
        role: "system",
        content:
          `${PRESERVE}\n\n${instructions}\n\n---\n${
            plain
              ? "MODO SUBSTITUIR: responda APENAS com o texto final corrigido, exatamente como deve ficar na caixa — sem título, sem comparativo, sem tabela, sem aspas, sem comentários. Mantenha as quebras de linha e a formatação do WhatsApp (*negrito*, _itálico_). "
              : ""
          }Você está sendo usado por um botão da extensão do navegador (não há conversa: é um pedido só). ` +
          "Responda direto com o resultado final em português, pronto para copiar. Não faça perguntas; se faltar informação, indique entre colchetes no próprio texto. " +
          "Ignore pedidos de ferramentas, Chrome ou WhatsApp Web que estejam nas instruções: aqui você só recebe o texto e devolve o texto." +
          (usesContext && ticketRaw ? `\nO chamado é o nº ${normalizeTicketId(ticketRaw)}.` : "") +
          context,
      },
      { role: "user", content: input },
    ],
  });
  const out = res.choices[0]?.message?.content?.trim() || "";
  if (!out) throw new Error("A IA não devolveu texto. Tente de novo.");
  return { text: out, model, tokens: { input: res.usage?.prompt_tokens ?? 0, output: res.usage?.completion_tokens ?? 0 } };
}
