import { generateResponse, generateVisionResponse, ProviderOptions } from "./openai";

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
      subcategory: string;
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
  recentContext?: string,
  customPrompt?: string
): Promise<PersonalRouteResult> {
  const systemPrompt = `Você é a secretária pessoal de ${ownerName}. Ele mandou uma
mensagem para o próprio número do WhatsApp — é assim que ele te alimenta com
tarefas, gastos/receitas e anotações pessoais. Classifique a intenção em um
dos 4 tipos e extraia os dados. Você nunca redige respostas para terceiros,
só confirma o que foi registrado.

${customPrompt ? `Instruções extras do usuário sobre como você deve se comportar/priorizar (siga-as, mas sempre retorne o JSON no formato pedido abaixo):\n${customPrompt}\n` : ""}
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

3. finance — menciona valor gasto ou recebido. Extraia categoria (mais ampla,
   ex: "Alimentação", "Moradia", "Transporte", "Saúde", "Financeiro", "Assinaturas",
   "Educação", "Imposto", "Lazer", "Pessoal") e subcategoria (mais específica
   dentro da categoria, ex: categoria "Alimentação" → subcategoria "Delivery" ou
   "Mercado"; categoria "Moradia" → subcategoria "Aluguel" ou "Água/Luz";
   categoria "Financeiro" → subcategoria "Cartão de crédito" ou "Parcelas").
   Ex: "Gastei 45 no mercado" → expense, 45, categoria "Alimentação", subcategoria "Mercado"
   Ex: "Recebi 3000 de salário" → income, 3000, categoria "Financeiro", subcategoria "Salário"
   Ex: "Paguei 120 de internet" → expense, 120, categoria "Moradia", subcategoria "Internet"

4. diary — reflexão, nota pessoal, mensagem de teste, cumprimento, ou
   qualquer coisa que não seja claramente tarefa/gasto/pergunta (é o padrão
   quando nada mais se encaixa, inclusive mensagens curtas tipo "teste" ou "oi").
   Infira também "mood" — EXATAMENTE um destes valores, nunca outro texto:
   "pessimo", "ruim", "neutro", "bom", "otimo". Se não der pra inferir com
   confiança, use "neutro".
   Ex: "Hoje foi puxado no trabalho mas terminei o relatório" → mood "neutro" ou "bom"
   Ex: "teste" → diary, content: "teste", mood "neutro", confirmation reconhecendo que é um teste

IMPORTANTE: os valores abaixo são só EXEMPLOS DE FORMATO — nunca copie o texto
literal deles. "confirmation" e os outros campos de texto sempre precisam ser
gerados a partir da mensagem real do usuário, nunca um placeholder genérico.

Retorne APENAS JSON válido, só com os campos do tipo escolhido:
{
  "type": "agenda_add|agenda_query|finance|diary",
  "category": "task|event|reminder|personal",
  "title": "<título real extraído da mensagem>",
  "description": "<descrição real extraída da mensagem>",
  "dueDate": "ISO 8601 ou null",
  "queryIntent": "pending_today|open_tickets|finance_summary|group_summary",
  "financeType": "income|expense",
  "amount": 0,
  "financeCategory": "<categoria curta>",
  "financeSubcategory": "<subcategoria curta>",
  "financeDescription": "<descrição curta>",
  "diaryContent": "<texto real da anotação>",
  "mood": "pessimo|ruim|neutro|bom|otimo",
  "confirmation": "<confirmação curta e específica sobre o que foi registrado>"
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
        subcategory: (parsed.financeSubcategory as string) || "",
        description: (parsed.financeDescription as string) || message.slice(0, 120),
        confirmation: (parsed.confirmation as string) || "✅ Lançamento registrado!",
      };
    }

    if (parsed.type === "diary") {
      const validMoods = ["pessimo", "ruim", "neutro", "bom", "otimo"];
      const mood = validMoods.includes(parsed.mood as string) ? (parsed.mood as string) : "neutro";
      return {
        type: "diary",
        content: (parsed.diaryContent as string) || message,
        mood,
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
      mood: "neutro",
      confirmation: `✅ Anotado!\n📋 ${message.slice(0, 60)}`,
    };
  }
}

export interface StatementEntry {
  date: string | null;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  subcategory: string;
}

const STATEMENT_INSTRUCTIONS = `Extraia TODAS as transações, sem exceção — cada linha de
gasto ou recebimento vira um item. Extratos de cartão costumam ter entre 10 e 40
linhas de transação; se você encontrar poucas, provavelmente pulou linhas — releia
com atenção, de cima pra baixo, linha por linha, até o fim da tabela. Não pare
depois das primeiras linhas nem resuma: cada transação individual precisa
aparecer como um item separado no resultado.

Para cada transação, identifique:
- date: data no formato ISO 8601 (YYYY-MM-DD).
  - Se for FATURA DE CARTÃO DE CRÉDITO: use a DATA DE VENCIMENTO da fatura para
    TODAS as transações, mesmo as que mostram uma data de compra/parcela diferente
    impressa na linha (ex: "Parcela 3/12" com data de fevereiro numa fatura que
    vence em agosto). O dinheiro sai da conta inteiro na data de vencimento —
    é isso que importa pro controle financeiro, não a data original da compra.
  - Se for EXTRATO DE CONTA CORRENTE/POUPANÇA: use a data de cada movimentação
    normalmente, como aparece na linha.
  - Se não der pra identificar nenhuma data, use null.
- description: a descrição da transação como aparece no extrato (curta, real).
- amount: valor numérico positivo (sem sinal, sem "R$").
- type: "expense" para compras/débitos, "income" para estornos/créditos/pagamentos recebidos.
- category: categoria ampla inferida (ex: "Alimentação", "Moradia", "Transporte",
  "Saúde", "Financeiro", "Assinaturas", "Educação", "Imposto", "Lazer", "Outros").
- subcategory: mais específica dentro da categoria (ex: categoria "Alimentação" →
  "Delivery"/"Mercado"/"Restaurante"; categoria "Financeiro" → "Cartão de crédito"/
  "Parcelas no cartão"/"IR"/"INSS"; categoria "Moradia" → "Aluguel"/"Água/Luz"). Se
  não der pra inferir, deixe vazio.

Ignore linhas que não são transações (cabeçalho, total, limite, juros, texto
institucional). Se não conseguir identificar nenhuma transação real, retorne
uma lista vazia.

Retorne APENAS um JSON válido no formato:
{ "entries": [ { "date": "2026-08-05", "description": "...", "amount": 45.90, "type": "expense", "category": "Alimentação", "subcategory": "Mercado" } ] }`;

function parseStatementResponse(content: string, source: string): StatementEntry[] {
  try {
    const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    const parsed = JSON.parse(json) as { entries?: unknown[] };
    if (!Array.isArray(parsed.entries)) {
      console.error(`[statement:${source}] resposta sem "entries" array. Conteúdo bruto (500 chars):`, content.slice(0, 500));
      return [];
    }

    const result = parsed.entries
      .map((raw): StatementEntry | null => {
        const e = raw as Record<string, unknown>;
        const amount = Number(e.amount);
        if (!amount || !e.description) return null;
        return {
          date: typeof e.date === "string" ? e.date : null,
          description: String(e.description).slice(0, 200),
          amount: Math.abs(amount),
          type: e.type === "income" ? "income" : "expense",
          category: typeof e.category === "string" ? e.category : "Outros",
          subcategory: typeof e.subcategory === "string" ? e.subcategory : "",
        };
      })
      .filter((e): e is StatementEntry => e !== null);

    if (result.length === 0) {
      console.error(`[statement:${source}] 0 transações extraídas. Conteúdo bruto (500 chars):`, content.slice(0, 500));
    } else {
      console.log(`[statement:${source}] ${result.length} transações extraídas`);
    }
    return result;
  } catch (err) {
    console.error(`[statement:${source}] falha ao parsear JSON. Conteúdo bruto (500 chars):`, content.slice(0, 500), err);
    return [];
  }
}

/**
 * Extrai todas as transações de um extrato (texto de um PDF de cartão/conta).
 * Diferente de routePersonalMessage, aqui a mensagem inteira vira uma LISTA
 * de lançamentos, não uma classificação única.
 */
export async function parseStatementEntries(
  statementText: string,
  providerOpts: ProviderOptions
): Promise<StatementEntry[]> {
  const systemPrompt = `Você recebeu o texto extraído de um extrato de cartão de crédito ou conta
bancária. ${STATEMENT_INSTRUCTIONS}`;

  const { content } = await generateResponse(
    [{ role: "user", content: statementText.slice(0, 12000) }],
    systemPrompt,
    0.2,
    4096,
    providerOpts
  );

  return parseStatementResponse(content, "pdf");
}

/**
 * Igual a parseStatementEntries, mas a partir de uma foto/print de extrato
 * (base64) em vez de texto — pra PDFs sem camada de texto real (comum em
 * faturas geradas com fontes customizadas) ou quando o usuário só tira print.
 */
export async function parseStatementImage(
  base64: string,
  mimetype: string,
  providerOpts: ProviderOptions
): Promise<StatementEntry[]> {
  const systemPrompt = `Você recebeu a foto/print de um extrato de cartão de crédito ou conta
bancária. ${STATEMENT_INSTRUCTIONS}`;

  const content = await generateVisionResponse(base64, mimetype, systemPrompt, providerOpts);
  return parseStatementResponse(content, "imagem");
}
