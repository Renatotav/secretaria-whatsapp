import { generateResponse, generateVisionResponse, ProviderOptions } from "./openai";
import { taxonomyPrompt } from "./finance-taxonomy";

// Lista única de categorias (a mesma do seletor do painel) — ver finance-taxonomy.ts.
const FINANCE_TAXONOMY = taxonomyPrompt();

export type PersonalQueryIntent = "pending_today" | "open_tickets" | "finance_summary" | "group_summary" | "savings_summary" | "month_closing" | "subscriptions" | "month_diagnosis" | "category_summary" | "chart" | "bills_due" | "budget_status" | "vr_balance";

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
      /** Categoria (ou subcategoria) perguntada, em category_summary e no gráfico de categoria. */
      queryCategory?: string;
      /** Qual gráfico ele pediu (só em queryIntent "chart"). */
      chartKind?: "categories" | "income_expense" | "category" | "goals";
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
      date: string | null;
      purchaseDate: string | null;
      /** Fatura/data de pagamento que ele disse EXPLICITAMENTE; passa por cima da regra do melhor dia. */
      billDate: string | null;
      paymentMethod: "cartão" | "pix" | "débito" | "boleto" | "dinheiro" | "ticket";
      account: string;
      status: "paid" | "pending";
      mood?: string;
      confirmation: string;
    }
  | {
      type: "diary";
      content: string;
      mood: string;
      confirmation: string;
    }
  | {
      type: "savings_add";
      goalName: string;
      amount: number;
      confirmation: string;
    }
  | {
      type: "finance_update_date";
      newPurchaseDate: string;
      confirmation: string;
    }
  | {
      // Pergunta livre sobre os próprios números ("quanto gastei com Uber em setembro?")
      type: "finance_question";
      question: string;
      confirmation: string;
    }
  | {
      // Conversa: cumprimento, dúvida de como usar, papo ou mensagem ambígua.
      // Nada é registrado; a resposta é escrita depois, com o manual de funções.
      type: "chat";
      confirmation: string;
    }
  | {
      // "E se meu salário for 3.300?" / "Posso comprar um capacete de 350 em 3x?"
      type: "finance_simulation";
      simIncome: number | null;
      simPurchaseAmount: number | null;
      simInstallments: number | null;
      simPaymentMethod: "cartão" | "pix" | "débito" | "dinheiro";
      simDescription: string;
      confirmation: string;
    };

export async function routePersonalMessage(
  message: string,
  ownerName: string,
  providerOpts: ProviderOptions,
  recentContext?: string,
  customPrompt?: string,
  creditCardDueDay: number = 10,
  creditCardBestDay: number = 5
): Promise<PersonalRouteResult> {
  const now = new Date();
  const brtTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const todayBRT = `${brtTime.getFullYear()}-${String(brtTime.getMonth() + 1).padStart(2, "0")}-${String(brtTime.getDate()).padStart(2, "0")}`;

  const systemPrompt = `Você é a secretária pessoal de ${ownerName}. Ele mandou uma
mensagem para o próprio número do WhatsApp — é assim que ele te alimenta com
tarefas, gastos/receitas e anotações pessoais. Classifique a intenção em um
dos tipos abaixo e extraia os dados. Você nunca redige respostas para terceiros,
só confirma o que foi registrado.

DATA DE HOJE: ${todayBRT}

${customPrompt ? `Instruções extras do usuário sobre como você deve se comportar/priorizar (siga-as, mas sempre retorne o JSON no formato pedido abaixo):\n${customPrompt}\n` : ""}
${recentContext ? `Contexto recente da conversa:\n${recentContext}\n` : ""}

Tipos:
1. agenda_add — tarefa, evento ou lembrete com título/data
   Ex: "Reunião com Dr. Carlos amanhã às 14h" → event
   Ex: "Ligar para Isabela sobre chamado 1812793" → task
   Ex: "Pagar cartão sexta" → reminder

2. agenda_query — pergunta sobre pendências/chamados/financeiro/grupos/metas
   Ex: "O que tenho pendente hoje?" → pending_today
   Ex: "Quais chamados estão abertos?" → open_tickets
   Ex: "Quanto gastei esse mês?" → finance_summary
   Ex: "Quanto tenho no VR?", "Saldo do vale?", "Quanto sobrou no ticket?" → vr_balance
   Ex: "Como está meu orçamento?", "Estou dentro do teto?", "Como estão meus limites?" → budget_status
   Ex: "O que falta pagar?", "Quais contas tenho pra pagar?", "O que vence essa semana?", "Tem conta atrasada?" → bills_due
       (contas/boletos/fatura a PAGAR; "o que tenho pendente hoje?" sem falar de conta continua pending_today)
   Ex: "Resumo do grupo PJe ontem" → group_summary
   Ex: "Como estão minhas metas?" ou "Quanto falta pro macbook?" → savings_summary
   Ex: "Fechamento do mês" ou "Como fechou o mês passado?" → month_closing
   Ex: "Quanto gasto com assinaturas?" ou "Quais minhas contas fixas?" → subscriptions
   Ex: "Por que estourei o mês?", "Onde estou gastando mais?", "Como está meu mês?" → month_diagnosis
   Ex: "Como está meu gasto com moradia?", "Quanto tá o mercado esse mês?", "Como estão minhas contas de luz?" → category_summary,
       com "financeCategory" = a categoria da taxonomia abaixo (ex: "Moradia", "Alimentação") ou, se ele citar só
       uma subcategoria (luz, internet, mercado), o nome dessa subcategoria (ex: "Energia elétrica", "Supermercado").
       Use category_summary só para "como está/quanto está" uma categoria; perguntas mais específicas são finance_question.
   Ex: pedido de GRÁFICO → chart, com "chartKind":
       "me manda o gráfico dos gastos", "gráfico do mês" → "categories"
       "gráfico de entradas e saídas", "gráfico dos últimos meses", "quanto entrou x saiu em gráfico" → "income_expense"
       "gráfico do mercado", "gráfico da moradia" → "category" (e "financeCategory" = a categoria/subcategoria, como em category_summary)
       "gráfico das metas" → "goals"

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
   291, categoria "Compras", subcategoria "Eletrônicos", installments: 17

   - REGRA PARA MEIO DE PAGAMENTO (paymentMethod):
     1) Receitas e Salário: use SEMPRE "pix".
     2) Aluguel, Moradia, Luz, Água, Condomínio, Contas de Casa: use SEMPRE "pix" (ou "boleto" se mencionado).
     3) Lançamentos futuros/pendentes no Pix (ex: Aluguel a pagar) MANTÊM "pix", JAMAIS convertem para cartão.
     4) SOMENTE compras no Cartão de Crédito ou parceladas no cartão usam "cartão".
     4b) Cartão de débito / "no débito" = "débito" (sai na hora, status "paid", NÃO é cartão de crédito).
     4c) Pago no VR / vale / vale-refeição / vale-alimentação / ticket / "Multi" = paymentMethod "ticket",
         account "VR", status "paid" (é o cartão de benefício, NÃO é cartão de crédito).
     5) DATA DE COMPRA NO CARTÃO: a fatura vence todo dia ${creditCardDueDay}. Compra feita
        ANTES do dia ${creditCardBestDay} cai na fatura que vence no dia ${creditCardDueDay} do
        mesmo mês; compra a partir do dia ${creditCardBestDay} cai na fatura do mês seguinte.
        Em "date" coloque esse vencimento e em "purchaseDate" o dia real da compra.
     6) FATURA DITA PELO DONO: se ele disser EXPLICITAMENTE a fatura ou o dia do pagamento
        ("pagamento para dia 10/11", "vai na fatura de novembro", "cai em 10/12"), coloque essa
        data em "billDate" (YYYY-MM-DD; "fatura de novembro" = dia ${creditCardDueDay} de novembro).
        Ela vale mais que a regra acima. Se ele não disser, "billDate" = null.

4. diary — RELATO pessoal: como foi o dia, o que sentiu, uma reflexão ou desabafo.
   Infira "mood" ("pessimo", "ruim", "neutro", "bom", "otimo").
   Cumprimentos, perguntas e papo NÃO são diário (use chat).

5. savings_add — guardar OU tirar dinheiro de uma Meta de Economia (SavingsGoal)
   Ex: "Guarda 100 reais pra viagem" → type "savings_add", amount: 100, goalName: "viagem"
   Ex: "Tirei 900 da reserva" → type "savings_add", amount: -900, goalName: "reserva"
   (retirada = amount NEGATIVO)

6. finance_update_date — o usuário está corrigindo ou fornecendo a data de compra de um gasto recém-lançado.
   Ex: "15/08" ou "foi dia 15" → type "finance_update_date", newPurchaseDate: "YYYY-MM-DD"

7. finance_simulation — PERGUNTA hipotética, nada foi gasto ainda: "e se...", "posso comprar...?", "dá pra comprar...?", "se eu ganhar...".
   NÃO é um gasto real: nunca use "finance" para essas perguntas.
   Ex: "Posso comprar um capacete de 350 em 3x?" → simPurchaseAmount: 350 (valor TOTAL), simInstallments: 3, simPaymentMethod: "cartão", simDescription: "capacete"
   Ex: "E se meu salário for 3300?" → simIncome: 3300
   Ex: "Dá pra comprar um tênis de 200 no pix?" → simPurchaseAmount: 200, simInstallments: 1, simPaymentMethod: "pix", simDescription: "tênis"
   Sem meio de pagamento dito = "cartão". simIncome = renda MENSAL total hipotética (ou null).

8. finance_question — PERGUNTA sobre números do próprio financeiro que não se encaixa nos atalhos de agenda_query.
   Ex: "Quanto gastei com Uber em setembro?", "Qual foi minha maior compra no cartão?", "Quantas vezes pedi delivery esse mês?", "Quanto falta pagar do Samsung?"
   Coloque a pergunta inteira em "question". NÃO é um gasto novo (nunca use "finance" para perguntas).

9. chat — conversa: cumprimento ("oi", "bom dia"), agradecimento, pergunta sobre o que você sabe fazer
   ou como usar alguma função ("como vejo minha fatura?", "você faz gráfico?"), papo solto, ou mensagem
   ambígua em que você não tem certeza do que ele quer. Na dúvida entre registrar algo errado e conversar,
   prefira chat — ele pode reformular. Nada é registrado.

IMPORTANTE:
- Ao registrar um novo gasto (type: "finance"), na "confirmation" inclua SEMPRE uma menção amigável informando que a compra foi registrada para a data de hoje (ou a data identificada) e explicando que ele pode responder com outra data se quiser alterar. Exemplo: "💸 Anotado! Gasto de R$ 33,98 pendente para o dia 10/09 (compra em DD/MM). Se foi em outra data, basta me responder com o dia (ex: 15/08)."

Retorne APENAS JSON válido, só com os campos do tipo escolhido:
{
  "type": "agenda_add|agenda_query|finance|diary|savings_add|finance_update_date|finance_simulation|finance_question|chat",
  "category": "task|event|reminder|personal",
  "title": "<título real extraído da mensagem>",
  "description": "<descrição real extraída da mensagem>",
  "dueDate": "ISO 8601 ou null",
  "queryIntent": "pending_today|open_tickets|finance_summary|group_summary|savings_summary|month_closing|subscriptions|month_diagnosis|category_summary|chart|bills_due|budget_status|vr_balance",
  "chartKind": "categories|income_expense|category|goals",
  "financeType": "income|expense",
  "amount": 0,
  "financeCategory": "<categoria curta>",
  "financeSubcategory": "<subcategoria curta>",
  "financeDescription": "<descrição curta>",
  "installments": "número total de parcelas ou null",
  "date": "ISO8601 da data de vencimento ou null",
  "purchaseDate": "ISO8601 da data real em que a compra foi feita, ou null",
  "billDate": "YYYY-MM-DD da fatura/pagamento que ele disse explicitamente, ou null",
  "newPurchaseDate": "ISO8601 (YYYY-MM-DD) para finance_update_date",
  "paymentMethod": "cartão|pix|débito|boleto|dinheiro|ticket",
  "account": "Principal|VR",
  "status": "paid|pending",
  "mood": "pessimo|ruim|neutro|bom|otimo",
  "diaryContent": "<texto>",
  "goalName": "<nome da meta>",
  "simIncome": "renda mensal hipotética ou null",
  "simPurchaseAmount": "valor total da compra hipotética ou null",
  "simInstallments": "número de parcelas da compra hipotética ou null",
  "simPaymentMethod": "cartão|pix|débito|dinheiro",
  "simDescription": "<o que pensa em comprar>",
  "question": "<pergunta do usuário, para finance_question>",
  "confirmation": "Sua resposta curta"
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
      const status = parsed.status === "pending" ? "pending" : "paid";
      let paymentMethod = ["cartão", "pix", "débito", "boleto", "dinheiro", "ticket"].includes(parsed.paymentMethod as string) ? (parsed.paymentMethod as any) : "pix";

      return {
        type: "finance",
        financeType: parsed.financeType === "income" ? "income" : "expense",
        amount: Number(parsed.amount) || 0,
        category: (parsed.financeCategory as string) || "Outros",
        subcategory: (parsed.financeSubcategory as string) || "",
        description: (parsed.financeDescription as string) || message.slice(0, 120),
        installments: Number.isFinite(installmentsNum) && installmentsNum > 1 ? installmentsNum : null,
        date: (parsed.date as string) || (parsed.financeDate as string) || null,
        purchaseDate: (parsed.purchaseDate as string) || (parsed.financePurchaseDate as string) || null,
        billDate: typeof parsed.billDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(parsed.billDate) ? parsed.billDate.slice(0, 10) : null,
        paymentMethod,
        // VR/ticket: conta do vale, já sai na hora.
        account: paymentMethod === "ticket" ? "VR" : (parsed.account as string) || "Principal",
        status: paymentMethod === "ticket" ? "paid" : status,
        confirmation: (parsed.confirmation as string) || "✅ Lançamento registrado!",
      };
    }

    if (parsed.type === "savings_add") {
      return {
        type: "savings_add",
        goalName: (parsed.goalName as string) || message.slice(0, 30),
        amount: Number(parsed.amount) || 0,
        confirmation: (parsed.confirmation as string) || "✅ Aporte anotado!",
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

    if (parsed.type === "chat") {
      return { type: "chat", confirmation: "" };
    }

    if (parsed.type === "finance_question") {
      return {
        type: "finance_question",
        question: (parsed.question as string) || message,
        confirmation: (parsed.confirmation as string) || "",
      };
    }

    if (parsed.type === "finance_simulation") {
      const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
      const method = ["cartão", "pix", "débito", "dinheiro"].includes(parsed.simPaymentMethod as string)
        ? (parsed.simPaymentMethod as "cartão" | "pix" | "débito" | "dinheiro")
        : "cartão";
      return {
        type: "finance_simulation",
        simIncome: num(parsed.simIncome),
        simPurchaseAmount: num(parsed.simPurchaseAmount),
        simInstallments: num(parsed.simInstallments),
        simPaymentMethod: method,
        simDescription: (parsed.simDescription as string) || "",
        confirmation: (parsed.confirmation as string) || "",
      };
    }

    if (parsed.type === "finance_update_date") {
      return {
        type: "finance_update_date",
        newPurchaseDate: (parsed.newPurchaseDate as string) || (parsed.purchaseDate as string) || todayBRT,
        confirmation: (parsed.confirmation as string) || "📅 Data da compra atualizada com sucesso!",
      };
    }

    if (parsed.type === "agenda_query") {
      const validIntents: PersonalQueryIntent[] = [
        "pending_today",
        "open_tickets",
        "finance_summary",
        "group_summary",
        "savings_summary",
        "month_closing",
        "subscriptions",
        "month_diagnosis",
        "category_summary",
        "chart",
        "bills_due",
        "budget_status",
        "vr_balance",
      ];
      const queryIntent = validIntents.includes(parsed.queryIntent as PersonalQueryIntent)
        ? (parsed.queryIntent as PersonalQueryIntent)
        : "pending_today";
      return {
        type: "agenda_query",
        queryIntent,
        queryCategory: (parsed.financeCategory as string) || undefined,
        chartKind: ["categories", "income_expense", "category", "goals"].includes(parsed.chartKind as string)
          ? (parsed.chartKind as "categories" | "income_expense" | "category" | "goals")
          : "categories",
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
    // Não deu pra classificar: conversa (pergunta o que ele quis dizer)
    // em vez de anotar no diário em silêncio.
    return { type: "chat", confirmation: "" };
  }
}

export interface StatementEntry {
  date: string | null;
  purchaseDate?: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  subcategory: string;
  paymentMethod?: string;
  account?: string;
  status?: "paid" | "pending";
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
- purchaseDate: a data original da compra no formato ISO 8601 (YYYY-MM-DD).
  Se for FATURA DE CARTÃO e a linha mostrar uma data de compra/parcela diferente
  da data de vencimento (ex: "14 fev" impresso na linha), extraia essa data.
  Pra inferir o ano dessa data (raramente vem explícito): se o mês da compra
  vier DEPOIS do mês de vencimento da fatura no calendário (ex: setembro numa
  fatura que vence em agosto), foi no ano anterior ao do vencimento; caso
  contrário, é o mesmo ano do vencimento. Se não for possível identificar, use null.
- description: a descrição da transação como aparece no extrato (curta, real).
  Se for FATURA DE CARTÃO, inclua também a indicação da parcela se houver (ex: "AMAZON BR - Parcela 6/10").
- amount: valor numérico positivo (sem sinal, sem "R$").
  Compra internacional mostra o valor em dólar e a cotação (ex: "USD 21,36 | Cotação USD: R$5,42  115,82"):
  use SEMPRE o valor em REAIS cobrado na fatura (115,82), nunca o valor em dólar.
- type: "expense" para compras/débitos, "income" para estornos/créditos/pagamentos recebidos.
- category e subcategory: ${FINANCE_TAXONOMY}
  Se não der pra inferir a subcategoria, deixe vazio.
- paymentMethod: OBRIGATÓRIO. Se for extrato/fatura de cartão de crédito, retorne "cartão" para todas as linhas. Se for extrato de conta corrente, tente inferir ("pix", "boleto", "dinheiro" ou "cartão" se for compra no débito). Se não souber, retorne "pix".
- account: OBRIGATÓRIO. Tente inferir a conta ("Principal" ou "VR"). Faturas de cartão e extratos bancários normais são "Principal". Ticket, Vale, Sodexo, VR, VA são "VR".

Ignore linhas que não são transações (cabeçalho, total, limite, juros, texto
institucional). Se não conseguir identificar nenhuma transação real, retorne
uma lista vazia.

Retorne APENAS um JSON válido no formato:
{ "entries": [ { "date": "2026-08-05", "purchaseDate": "2026-02-14", "description": "...", "amount": 45.90, "type": "expense", "category": "Alimentação", "subcategory": "Supermercado", "paymentMethod": "cartão", "account": "Principal" } ] }`;
}

/**
 * Resposta cortada pelo limite de tamanho da IA (fatura longa): recupera os
 * itens de "entries" que vieram completos, em vez de perder todos.
 */
function salvageEntries(content: string): unknown[] {
  const start = content.indexOf("[", content.indexOf('"entries"'));
  if (start < 0) return [];
  const items: unknown[] = [];
  let depth = 0;
  let inString = false;
  let objStart = -1;
  for (let i = start + 1; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          items.push(JSON.parse(content.slice(objStart, i + 1)));
        } catch {
          // item malformado: pula
        }
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  return items;
}

function parseStatementResponse(content: string, source: string): StatementEntry[] {
  try {
    const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    let parsed: { entries?: unknown[] };
    try {
      parsed = JSON.parse(json) as { entries?: unknown[] };
    } catch (err) {
      const salvaged = salvageEntries(content);
      if (salvaged.length === 0) throw err;
      console.error(`[statement:${source}] JSON cortado; aproveitei ${salvaged.length} transações completas`);
      parsed = { entries: salvaged };
    }
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
          purchaseDate: typeof e.purchaseDate === "string" ? e.purchaseDate : undefined,
          description: String(e.description).slice(0, 200),
          amount: Math.abs(amount),
          type: typeof e.type === "string" && e.type === "income" ? "income" : "expense",
          category: typeof e.category === "string" ? e.category : "Outros",
          subcategory: typeof e.subcategory === "string" ? e.subcategory : "",
          paymentMethod: ["cartão", "pix", "débito", "boleto", "dinheiro"].includes(e.paymentMethod as string) ? (e.paymentMethod as any) : "pix",
          account: (e.account as string) || "Principal",
          status: e.status === "pending" ? "pending" : "paid",
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

export interface InvoiceItemEntry {
  name: string;
  category: string;
  amount: number;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceEntry {
  date: string;
  total: number;
  category: string;
  subcategory: string;
  paymentMethod: "cartão" | "pix" | "débito" | "boleto" | "dinheiro" | "ticket";
  account: string;
  status: "paid" | "pending";
  items: InvoiceItemEntry[];
}

export async function parseInvoiceImage(
  base64: string,
  mimetype: string,
  providerOpts: ProviderOptions,
  ownerName = "",
  caption = ""
): Promise<InvoiceEntry | null> {
  const systemPrompt = `Você recebeu a foto de uma nota fiscal, cupom fiscal ou fatura.
A legenda/texto do usuário enviada junto foi: "${caption}"

Sua tarefa é extrair os metadados principais e a lista DETALHADA de cada produto/serviço cobrado.

Metadados:
- date: data da COMPRA que aparece no topo/cabeçalho do cupom (formato ISO YYYY-MM-DD). NÃO use datas da seção "Forma de Pagamento" ou vencimento. Se não conseguir ler a data claramente, use a data de hoje.
- total: o VALOR A PAGAR final da nota (após descontos, número, sem cifrão). Ex: "VALOR A PAGAR R$ 65,39" -> total: 65.39.
- category e subcategory: Classifique a despesa global usando a taxonomia padrão:
${FINANCE_TAXONOMY}
- paymentMethod: descubra a forma de pagamento ("cartão", "débito", "pix", "boleto", "dinheiro", ou "ticket"). IMPORTANTE: "CARTAO CREDITO", "Credito Rotativo", "TEF Rotativo", "TEF Crédito" são TODOS cartão de crédito → use "cartão". "DEBITO", "Cartão de Débito", "TEF Débito" → use "débito". Se for vale alimentação, Ticket, VR, Sodexo, TEF benefício/alimentação, use "ticket". Se a nota NÃO mostrar a forma de pagamento, retorne "" (vazio) — não chute.
- account: a conta de onde saiu o dinheiro. Use SEMPRE "Principal" — mesmo quando o pagamento for cartão de crédito, débito, pix ou dinheiro. Use "VR" SOMENTE se o pagamento for ticket/vale alimentação, VR, Sodexo, VA. Nunca retorne "Cartão de Crédito" como account.
- status: REGRA ABSOLUTA: cartão de crédito ("cartão", TEF Rotativo, Credito Rotativo) = SEMPRE "pending" (nunca paid). pix, dinheiro, débito, ticket = "paid".

Itens (produtos/serviços):
Para CADA linha de produto/serviço, extraia:
- name: nome do item como aparece na nota (ex: "HEINEKEN LATA 350ML")
- category: classifique este PRODUTO específico com uma macro-categoria. Por exemplo, num supermercado, pode ser "Bebidas Alcoólicas", "Limpeza", "Carnes", "Petiscos", "Essenciais", etc.
- quantity: quantidade comprada (número)
- unitPrice: valor unitário do item (número)
- amount: valor total pago pelo item (número, com desconto já deduzido do item se houver "desconto sobre item").
ATENÇÃO PARA DESCONTOS: Se houver linha de "desconto sobre item" ou desconto global na nota, abata o valor do desconto no 'amount' do item ou inclua um item de desconto com valor negativo (ex: amount: -2.51) para que a SOMA de todos os 'amount' seja EXATAMENTE IGUAL ao 'total' (VALOR A PAGAR).

IMPORTANTE:
- Retorne APENAS um JSON válido. Não coloque texto antes ou depois.

Formato esperado:
{
  "date": "2026-08-15",
  "total": 150.50,
  "category": "Alimentação",
  "subcategory": "Supermercado",
  "paymentMethod": "cartão",
  "account": "Principal",
  "status": "pending",
  "items": [
    { "name": "Cerveja", "category": "Bebidas Alcoólicas", "quantity": 2, "unitPrice": 10.0, "amount": 20.0 }
  ]
}`;

  try {
    const content = await generateVisionResponse(base64, mimetype, systemPrompt, providerOpts);
    const json = content.match(/\{[\s\S]*\}/)?.[0] ?? content;
    const parsed = JSON.parse(json) as InvoiceEntry;
    if (!parsed.items || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch (err) {
    console.error("[invoice] falha ao parsear JSON:", err);
    return null;
  }
}
