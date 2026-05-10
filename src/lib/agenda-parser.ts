import { generateResponse, ProviderOptions } from "./openai";

export interface AgendaParseResult {
  type: "add" | "query";
  category: "task" | "event" | "reminder" | "personal";
  title: string;
  description: string;
  dueDate: string | null;
  queryIntent: "pending_today" | "open_tickets" | "group_summary" | null;
  confirmation: string;
}

export async function parsePersonalMessage(
  message: string,
  ownerName: string,
  providerOpts: ProviderOptions
): Promise<AgendaParseResult> {
  const systemPrompt = `Você é secretária pessoal de ${ownerName}.
Ele enviou uma mensagem para si mesmo — pode ser para adicionar algo à agenda
ou consultar informações.

Exemplos de adição:
- "Reunião com Dr. Carlos amanhã às 14h" → event
- "Ligar para Isabela sobre chamado 1812793" → task
- "Pagar cartão sexta" → reminder

Exemplos de consulta:
- "O que tenho pendente hoje?" → queryIntent: pending_today
- "Quais chamados estão abertos?" → queryIntent: open_tickets
- "Resumo do grupo PJe ontem" → queryIntent: group_summary

Retorne APENAS JSON válido:
{
  "type": "add|query",
  "category": "task|event|reminder|personal",
  "title": "título do item",
  "description": "descrição detalhada",
  "dueDate": "ISO 8601 ou null",
  "queryIntent": "pending_today|open_tickets|group_summary|null",
  "confirmation": "✅ Anotado!\\n📋 Título\\nDetalhes formatados"
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
    return JSON.parse(json) as AgendaParseResult;
  } catch {
    return {
      type: "add",
      category: "personal",
      title: message.slice(0, 60),
      description: message,
      dueDate: null,
      queryIntent: null,
      confirmation: `✅ Anotado!\n📋 ${message.slice(0, 60)}`,
    };
  }
}
