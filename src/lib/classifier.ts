import { generateResponse, ProviderOptions } from "./openai";

export interface ClassificationResult {
  urgent: boolean;
  category: "mention" | "task" | "event" | "urgent_call" | "ignore" | null;
  title: string;
  description: string;
  dueDate: string | null;
  ticketIds: string[];
  reason: string;
}

export async function classifyGroupMessage(
  message: string,
  senderName: string,
  groupName: string,
  groupFocus: string,
  ownerName: string,
  ownerRole: string,
  providerOpts: ProviderOptions,
  customPrompt?: string
): Promise<ClassificationResult> {
  const systemPrompt = `Você é secretária pessoal de ${ownerName}, ${ownerRole}.
Grupo: ${groupName} | Foco: ${groupFocus}
Enviado por: ${senderName}
${customPrompt ? `\nInstruções extras do usuário sobre como você deve se comportar/priorizar (siga-as, mas sempre retorne o JSON no formato pedido abaixo):\n${customPrompt}\n` : ""}

Exige notificação IMEDIATA se:
- Menciona "@${ownerName}" OU apenas o nome "${ownerName}" na mensagem (com ou sem @)
- Atribui tarefa diretamente ao ${ownerName}
- Convoca ${ownerName} para reunião ou evento
- Chamado urgente que envolve ${ownerName}
- Escalação ou problema crítico direcionado ao ${ownerName}

NÃO exige notificação:
- Bom dia, boa tarde, figurinhas, brincadeiras
- Confirmações simples ("ok", "certo", "obrigado")
- Discussões gerais que não envolvem ${ownerName} diretamente

Extraia APENAS chamados com estes formatos exatos:
- S seguido de 6 a 7 dígitos (ex: S2363114, S277882)
- R seguido de 6 a 7 dígitos (ex: R2364186)
- Número standalone de 6 a 7 dígitos (ex: 2041838)
- "redmine" seguido de # opcional e número (ex: redmine #123456, redmine123456) — extraia como aparece, ex: "redmine #123456"
NÃO extraia: números de processo judicial (formato XXXXXXX-XX.XXXX), JIDs do WhatsApp (15+ dígitos), datas, qualquer outro número.

Você NÃO redige nem sugere respostas — só classifica e resume, para manter
${ownerName} informado sobre o que acontece no grupo.

Retorne APENAS JSON válido:
{
  "urgent": boolean,
  "category": "mention|task|event|urgent_call|ignore|null",
  "title": "título curto se urgente",
  "description": "descrição clara se urgente",
  "dueDate": "ISO 8601 ou null",
  "ticketIds": [],
  "reason": "explicação"
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
    };
  }
}
