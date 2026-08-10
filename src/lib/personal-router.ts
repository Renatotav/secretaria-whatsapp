import { generateResponse, ProviderOptions } from "./openai";

export type PersonalQueryIntent = "pending_today" | "open_tickets" | "finance_summary" | "group_summary";

export type PersonalRouteResult =
  | {
      type: "agenda_add";
      category: "task" | "event" | "reminder" | "personal";
      title: string;
      description: string;
      dueDate: string | null;
      confirmation: string;
    }
  | {
      type: "agenda_query";
      queryIntent: PersonalQueryIntent;
      confirmation: string;
    }
  | {
      type: "finance";
      financeType: "income" | "expense";
      amount: number;
      category: string;
      description: string;
      confirmation: string;
    }
  | {
      type: "diary";
      content: string;
      mood: string;
      confirmation: string;
    };

export async function routePersonalMessage(
  message: string,
  ownerName: string,
  providerOpts: ProviderOptions,
  recentContext?: string
): Promise<PersonalRouteResult> {
  const systemPrompt = `Você é a secretária pessoal de ${ownerName}. Ele mandou uma
mensagem para o próprio número do WhatsApp — é assim que ele te alimenta com
tarefas, gastos/receitas e anotações pessoais. Classifique a intenção em um
dos 4 tipos e extraia os dados. Você nunca redige respostas para terceiros,
só confirma o que foi registrado.

${recentContext ? `Contexto recente da conversa:\n${recentContext}\n` : ""}

Tipos:
1. agenda_add — tarefa, evento ou lembrete com título/data
   Ex: "Reunião com Dr. Carlos amanhã às 14h" → event
   Ex: "Ligar para Isabela sobre chamado 1812793" → task
   Ex: "Pagar cartão sexta" → reminder

2. agenda_query — pergunta sobre pendências/chamados/financeiro/grupos
   Ex: "O que tenho pendente hoje?" → pending_today
   Ex: "Quais chamados estão abertos?" → open_tickets
   Ex: "Quanto gastei esse mês?" → finance_summary
   Ex: "Resumo do grupo PJe ontem" → group_summary

3. finance — menciona valor gasto ou recebido
   Ex: "Gastei 45 no mercado" → expense, 45, categoria "Alimentação"
   Ex: "Recebi 3000 de salário" → income, 3000, categoria "Salário"
   Ex: "Paguei 120 de internet" → expense, 120, categoria "Contas"

4. diary — reflexão, nota pessoal ou qualquer coisa que não seja
   claramente tarefa/gasto/pergunta (é o padrão quando nada mais se encaixa)
   Ex: "Hoje foi puxado no trabalho mas terminei o relatório"

Retorne APENAS JSON válido, só com os campos do tipo escolhido:
{
  "type": "agenda_add|agenda_query|finance|diary",
  "category": "task|event|reminder|personal",
  "title": "título do item",
  "description": "descrição detalhada",
  "dueDate": "ISO 8601 ou null",
  "queryIntent": "pending_today|open_tickets|finance_summary|group_summary",
  "financeType": "income|expense",
  "amount": 0,
  "financeCategory": "categoria curta",
  "financeDescription": "descrição curta",
  "diaryContent": "texto da anotação",
  "mood": "humor em uma palavra ou vazio",
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
    const parsed = JSON.parse(json) as Record<string, unknown>;

    if (parsed.type === "finance") {
      return {
        type: "finance",
        financeType: parsed.financeType === "income" ? "income" : "expense",
        amount: Number(parsed.amount) || 0,
        category: (parsed.financeCategory as string) || "Outros",
        description: (parsed.financeDescription as string) || message.slice(0, 120),
        confirmation: (parsed.confirmation as string) || "✅ Lançamento registrado!",
      };
    }

    if (parsed.type === "diary") {
      return {
        type: "diary",
        content: (parsed.diaryContent as string) || message,
        mood: (parsed.mood as string) || "",
        confirmation: (parsed.confirmation as string) || "✅ Anotado no diário!",
      };
    }

    if (parsed.type === "agenda_query") {
      const validIntents: PersonalQueryIntent[] = [
        "pending_today",
        "open_tickets",
        "finance_summary",
        "group_summary",
      ];
      const queryIntent = validIntents.includes(parsed.queryIntent as PersonalQueryIntent)
        ? (parsed.queryIntent as PersonalQueryIntent)
        : "pending_today";
      return {
        type: "agenda_query",
        queryIntent,
        confirmation: (parsed.confirmation as string) || "",
      };
    }

    return {
      type: "agenda_add",
      category: (parsed.category as "task" | "event" | "reminder" | "personal") || "personal",
      title: (parsed.title as string) || message.slice(0, 60),
      description: (parsed.description as string) || message,
      dueDate: (parsed.dueDate as string) || null,
      confirmation: (parsed.confirmation as string) || `✅ Anotado!\n📋 ${message.slice(0, 60)}`,
    };
  } catch {
    return {
      type: "diary",
      content: message,
      mood: "",
      confirmation: `✅ Anotado!\n📋 ${message.slice(0, 60)}`,
    };
  }
}
