import { generateResponse, generateVisionResponse, ProviderOptions } from "./openai";

// Taxonomia de categorias/subcategorias financeiras — mesma usada no seletor
// manual do painel Financeiro (baseada na planilha antiga do usuário), pra
// tudo que a IA classifica (mensagem no WhatsApp ou extrato) usar os mesmos
// nomes de categoria.
const FINANCE_TAXONOMY = `Categorias de RECEITA (income): Salário (Salário fixo, Vale Alimentação, Bônus),
Renda Extra (Freelance, Comissões, Venda de produtos), Renda Passiva (Dividendos),
Dinheiro em Conta (Nubank), Outros (Reembolso, Restituição IR).
Categorias de DESPESA (expense): Moradia (Aluguel, Financiamento, Condomínio,
Energia elétrica, Água/Esgoto, Internet, Gás), Alimentação (Supermercado,
Restaurantes, Delivery), Transporte (Combustível, Manutenção veículo, Seguro,
Transporte público, Uber/Taxi), Saúde (Plano de saúde, Medicamentos), Imposto
(IR, INSS, IPVA, IOF), Educação (Cursos, Mensalidade, Livros), Assinaturas (Streaming,
Apps/Softwares, Academia), Pessoal (Roupas, Beleza, Lazer), Financeiro (Cartão de
crédito, Parcelas no cartão, Tarifas bancárias, Empréstimos), Família (Mesada,
Gastos com filhos), Outros (Imprevistos, Manutenção, Presentes).
Prefira essas categorias/subcategorias quando a transação encaixar bem; só use
outro nome se nenhuma delas fizer sentido pro caso.`;

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
      installments: number | null;
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

3. finance — menciona valor gasto ou recebido. Extraia categoria e subcategoria.
   ${FINANCE_TAXONOMY}
   Ex: "Gastei 45 no mercado" → expense, 45, categoria "Alimentação", subcategoria "Supermercado"
   Ex: "Recebi 3000 de salário" → income, 3000, categoria "Salário", subcategoria "Salário fixo"
   Ex: "Paguei 120 de internet" → expense, 120, categoria "Moradia", subcategoria "Internet"

   Se a mensagem mencionar que a compra foi PARCELADA (ex: "em 17x", "parcelado
   em 12 vezes", "10 parcelas de 50"), extraia o número TOTAL de parcelas em
   "installments" (ex: 17). O "amount" continua sendo o valor de UMA parcela
   (não o total da compra). Se não for parcelado ou vier só à vista, deixe
   "installments" null. As parcelas restantes são lançadas automaticamente nos
   meses seguintes — não precisa mencionar isso na "confirmation".
   Ex: "Comprei um Samsung S25 de 291 no cartão do Bruno, em 17x" → expense,
   291, categoria "Financeiro", subcategoria "Parcelas no cartão", installments: 17

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
  "installments": "número total de parcelas ou null",
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
      const installmentsNum = Number(parsed.installments);
      return {
        type: "finance",
        financeType: parsed.financeType === "income" ? "income" : "expense",
        amount: Number(parsed.amount) || 0,
        category: (parsed.financeCategory as string) || "Outros",
        subcategory: (parsed.financeSubcategory as string) || "",
        description: (parsed.financeDescription as string) || message.slice(0, 120),
        installments: Number.isFinite(installmentsNum) && installmentsNum > 1 ? installmentsNum : null,
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

function buildStatementInstructions(ownerName: string): string {
  const cardFilter = ownerName
    ? `\nATENÇÃO — fatura com mais de um cartão/titular: se a página mostrar um
cabeçalho de titular de cartão (ex: "Cartão Final XXXX - NOME DA PESSOA") cujo
nome NÃO seja "${ownerName}" (ou variação óbvia dele), NÃO extraia as
transações listadas sob esse cabeçalho — pertencem a outra pessoa. Páginas
sem nenhum cabeçalho de titular visível são continuação da lista do cartão
do titular mostrado na página anterior da mesma leva de fotos; nesse caso,
trate como sendo do titular "${ownerName}" normalmente (não deixe de
extrair só por falta de cabeçalho repetido).\n`
    : "";
  return `Extraia TODAS as transações, sem exceção — cada linha de
gasto ou recebimento vira um item. Extratos de cartão costumam ter entre 10 e 40
linhas de transação; se você encontrar poucas, provavelmente pulou linhas — releia
com atenção, de cima pra baixo, linha por linha, até o fim da tabela. Não pare
depois das primeiras linhas nem resuma: cada transação individual precisa
aparecer como um item separado no resultado.
${cardFilter}
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
  Se for FATURA DE CARTÃO e a linha mostrar uma data de compra/parcela diferente
  da data de vencimento (ex: "Parcela 6/10" com "14 fev" impresso na linha),
  inclua essa data original da compra entre parênteses no final da descrição,
  no formato "(compra em DD/MM)" — ex: "AMAZON BR - Parcela 6/10 (compra em
  14/02)". Pra inferir o ano dessa data (raramente vem explícito): se o mês da
  compra vier DEPOIS do mês de vencimento da fatura no calendário (ex: setembro
  numa fatura que vence em agosto), foi no ano anterior ao do vencimento; caso
  contrário, é o mesmo ano do vencimento.
- amount: valor numérico positivo (sem sinal, sem "R$").
- type: "expense" para compras/débitos, "income" para estornos/créditos/pagamentos recebidos.
- category e subcategory: ${FINANCE_TAXONOMY}
  Se não der pra inferir a subcategoria, deixe vazio.

Ignore linhas que não são transações (cabeçalho, total, limite, juros, texto
institucional). Se não conseguir identificar nenhuma transação real, retorne
uma lista vazia.

Retorne APENAS um JSON válido no formato:
{ "entries": [ { "date": "2026-08-05", "description": "...", "amount": 45.90, "type": "expense", "category": "Alimentação", "subcategory": "Mercado" } ] }`;
}

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
  providerOpts: ProviderOptions,
  ownerName = ""
): Promise<StatementEntry[]> {
  const systemPrompt = `Você recebeu o texto extraído de um extrato de cartão de crédito ou conta
bancária. ${buildStatementInstructions(ownerName)}`;

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
  providerOpts: ProviderOptions,
  ownerName = ""
): Promise<StatementEntry[]> {
  const systemPrompt = `Você recebeu a foto/print de um extrato de cartão de crédito ou conta
bancária. ${buildStatementInstructions(ownerName)}`;

  const content = await generateVisionResponse(base64, mimetype, systemPrompt, providerOpts);
  return parseStatementResponse(content, "imagem");
}
