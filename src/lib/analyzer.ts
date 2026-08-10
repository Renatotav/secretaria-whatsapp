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
  providerOpts: ProviderOptions
): Promise<AnalysisResult> {
  const systemPrompt = `Você é secretária pessoal de um ${ownerRole}.
Analise a mensagem recebida de "${contactName}" para manter o supervisor
informado. Você NÃO redige nem sugere respostas — só analisa e resume.

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
