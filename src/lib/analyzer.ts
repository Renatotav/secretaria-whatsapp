import { generateResponse, ProviderOptions } from "./openai";

export interface AnalysisResult {
  subject: string;
  summary: string;
  urgency: "low" | "normal" | "high" | "critical";
  urgencyReason: string;
  ticketIds: string[];
}

export async function analyzePrivateMessage(
  message: string,
  contactName: string,
  ownerRole: string,
  providerOpts: ProviderOptions,
  customPrompt?: string
): Promise<AnalysisResult> {
  const systemPrompt = `Você é secretária pessoal de um ${ownerRole}.
Analise a mensagem recebida de "${contactName}" para manter o supervisor
informado. Você NÃO redige nem sugere respostas — só analisa e resume.
${customPrompt ? `\nInstruções extras do usuário sobre como você deve se comportar/priorizar (siga-as, mas sempre retorne o JSON no formato pedido abaixo):\n${customPrompt}\n` : ""}
Retorne APENAS JSON válido:
{
  "subject": "assunto em até 6 palavras",
  "summary": "resumo claro em 2-3 frases",
  "urgency": "low|normal|high|critical",
  "urgencyReason": "justificativa da urgência",
  "ticketIds": ["S2058856"]
}

Critérios de urgência:
- critical: emergência, prazo hoje, pedido urgente explícito
- high: prazo em até 2 dias, assunto importante de trabalho
- normal: assunto sem prazo imediato
- low: conversa informal, sem ação necessária`;

  const { content } = await generateResponse(
    [{ role: "user", content: message }],
    systemPrompt,
    0.3,
    512,
    providerOpts
  );

  try {
    const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    return JSON.parse(json) as AnalysisResult;
  } catch {
    return {
      subject: "Mensagem recebida",
      summary: message.slice(0, 150),
      urgency: "normal",
      urgencyReason: "Análise indisponível",
      ticketIds: [],
    };
  }
}

export interface CommitmentDetection {
  found: boolean;
  /** Ex: "Treino", "Reunião", "Consulta". */
  title: string;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:MM (24h) ou null se não tiver hora. */
  time: string | null;
}

/**
 * Lê o trecho final de uma conversa privada e diz se ficou combinado um
 * COMPROMISSO com data (treino, reunião, consulta, encontro...). Interpreta
 * linguagem livre ("amanhã depois do almoço", "pode ser às 7 então?"). Não
 * resume nada: só devolve o compromisso, se houver.
 */
export async function detectCommitment(
  conversation: string,
  contactName: string,
  todayISO: string,
  weekday: string,
  providerOpts: ProviderOptions
): Promise<CommitmentDetection> {
  const systemPrompt = `Você lê o FINAL de uma conversa de WhatsApp entre Renato (o dono) e ${contactName}.
Hoje é ${weekday}, ${todayISO} (horário de Brasília).
Diga se a ÚLTIMA mensagem fecha ou propõe um COMPROMISSO com data para o Renato: encontro, treino, reunião,
consulta, entrega, compromisso de trabalho, etc. Interprete linguagem livre ("amanhã cedo", "sexta depois do
almoço" = 13:00, "semana que vem na terça", "pode ser às 7 então?"). Use as mensagens anteriores como contexto.
NÃO é compromisso: conversa solta, lembrete genérico sem data, algo que já passou, plano vago ("um dia a gente vê").
Responda APENAS JSON: {"found": true|false, "title": "<curto, ex: Treino>", "date": "YYYY-MM-DD", "time": "HH:MM" ou null}`;
  try {
    const { content } = await generateResponse([{ role: "user", content: conversation }], systemPrompt, 0, 150, providerOpts);
    const json = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] ?? content) as Record<string, unknown>;
    const date = typeof json.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.date) ? json.date : null;
    const time = typeof json.time === "string" && /^\d{1,2}:\d{2}$/.test(json.time) ? json.time.padStart(5, "0") : null;
    return { found: json.found === true && !!date, title: typeof json.title === "string" ? json.title.slice(0, 60) : "Compromisso", date, time };
  } catch {
    return { found: false, title: "", date: null, time: null };
  }
}
