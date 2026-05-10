import { generateResponse, ProviderOptions } from "./openai";

export interface ClassificationResult {
  urgent: boolean;
  category: "mention" | "task" | "event" | "urgent_call" | "ignore" | null;
  title: string;
  description: string;
  dueDate: string | null;
  ticketIds: string[];
  reason: string;
  suggestion: string;
}

export async function classifyGroupMessage(
  message: string,
  senderName: string,
  groupName: string,
  groupFocus: string,
  ownerName: string,
  ownerRole: string,
  providerOpts: ProviderOptions
): Promise<ClassificationResult> {
  const systemPrompt = `Você é secretária pessoal de ${ownerName}, ${ownerRole}.
Grupo: ${groupName} | Foco: ${groupFocus}
Enviado por: ${senderName}

Exige notificação IMEDIATA se:
- Menciona diretamente @${ownerName} ou seu nome
- Atribui tarefa ao ${ownerName}
- Convoca para reunião ou evento
- Chamado urgente que envolve ${ownerName}
- Escalação ou problema crítico

NÃO exige notificação:
- Bom dia, boa tarde, figurinhas, brincadeiras
- Confirmações simples ("ok", "certo", "obrigado")
- Discussões que não envolvem ${ownerName}

Extraia números de chamados citados (S######, R######, ou só números de 7+ dígitos).

Se urgent for true, gere uma sugestão de resposta curta, natural e profissional
que ${ownerName} poderia enviar ao grupo. Máximo 2 frases.

Retorne APENAS JSON válido:
{
  "urgent": boolean,
  "category": "mention|task|event|urgent_call|ignore|null",
  "title": "título curto se urgente",
  "description": "descrição clara se urgente",
  "dueDate": "ISO 8601 ou null",
  "ticketIds": [],
  "reason": "explicação",
  "suggestion": "texto da sugestão ou vazio"
}`;

  const { content } = await generateResponse(
    [{ role: "user", content: message }],
    systemPrompt,
    0.3,
    512,
    providerOpts
  );

  try {
    const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    return JSON.parse(json) as ClassificationResult;
  } catch {
    return {
      urgent: false,
      category: "ignore",
      title: "",
      description: "",
      dueDate: null,
      ticketIds: [],
      reason: "Classificação indisponível",
      suggestion: "",
    };
  }
}
