// Conversa livre com a IA: pergunta sobre o financeiro (com os números do mês) e
// o manual do que a secretária sabe fazer. Saiu de message-handlers.ts (28/10/2026) —
// sem estado de conversa.

import { prisma } from "./prisma";
import { generateResponse, type ProviderOptions } from "./openai";
import { todayBRT } from "./dates";
import { Prisma, type AgentConfig } from "@prisma/client";

/**
 * Pergunta livre sobre o financeiro: a IA escreve um SELECT, que roda numa
 * transação SOMENTE LEITURA com tempo limite, e depois resume o resultado.
 * Só tabelas do financeiro; qualquer coisa que não seja um SELECT único é recusada.
 */
// Tabelas que a pergunta livre do financeiro pode ler. Lista do que PODE (antes era
// do que não pode, e escapava: chaves em AgentConfig/FlowState, chamados do trabalho).
const TABELAS_FINANCEIRO = new Set(["FinanceEntry", "InvoiceItem", "SavingsGoal", "Budget"]);

// Funções e palavras do SQL que podem vir antes de "(" numa consulta de financeiro.
const FUNCOES_OK = new Set([
  "select", "from", "join", "where", "and", "or", "not", "in", "exists", "any", "all", "as", "on", "over", "filter", "values", "then", "else", "when", "case", "with", "partition", "by", "using", "union", "lateral",
  "sum", "count", "avg", "min", "max", "coalesce", "nullif", "greatest", "least", "round", "abs", "ceil", "floor", "trunc",
  "date_trunc", "date_part", "extract", "to_char", "to_date", "make_date", "age", "date", "now", "interval",
  "lower", "upper", "trim", "length", "left", "right", "split_part", "concat", "replace", "position", "substring",
  "string_agg", "array_agg", "row_number", "rank", "dense_rank", "lag", "lead", "generate_series", "cast", "numeric", "float8", "int", "bool_or", "bool_and",
]);

/** SELECT único, sem comando que escreve, sem tabela fora do financeiro e sem truque de nome (U&"…"). */
export function sqlSeguro(sql: string): boolean {
  if (!/^\s*(select|with)\b/i.test(sql)) return false;
  if (/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|vacuum|call|do|execute|set|reset|lock|listen|notify|pg_sleep|lo_import|lo_export|dblink)\b|;|\bpg_|information_schema|_prisma|\bu&/i.test(sql)) return false;
  // Nome de tabela com letra maiúscula só existe entre aspas: qualquer outra tabela do banco citada = recusa.
  if (Object.values(Prisma.ModelName).some((t) => !TABELAS_FINANCEIRO.has(t) && sql.includes(`"${t}"`))) return false;
  // Só funções conhecidas: as que executam texto como consulta (query_to_xml, xpath…)
  // montariam o nome de outra tabela sem escrevê-lo. Função entre aspas também não.
  // Comentário escondia o nome da função do filtro ("query_to_xml/**/("): consulta de financeiro não precisa.
  if (/--|\/\*|\*\//.test(sql)) return false;
  if (/"\s*\(/.test(sql)) return false;
  for (const m of sql.matchAll(/([a-z_][a-z0-9_]*)\s*\(/gi)) if (!FUNCOES_OK.has(m[1].toLowerCase())) return false;
  return true;
}

export type ContaSql = { sql: string; linhas: unknown[] };

/** `onConta` recebe a consulta e as linhas usadas (o painel mostra em "🔍 Ver a conta"). */
export async function answerFinanceQuestion(question: string, providerOpts: ProviderOptions, onConta?: (c: ContaSql) => void): Promise<string> {
  const today = todayBRT();
  const schema = `Tabelas PostgreSQL (nomes entre aspas duplas):
"FinanceEntry"(id, type 'income'|'expense', amount float, category, subcategory, description, date timestamp, "purchaseDate" timestamp|null, "paymentMethod" 'cartão'|'pix'|'débito'|'boleto'|'dinheiro'|'ticket', account, status 'paid'|'pending', mood, source)
  - date = mês em que o dinheiro sai/entra (compra no cartão = dia do vencimento da fatura); "purchaseDate" = dia real da compra.
  - Parcelas têm "Parcela X/Y" na description; "(previsto)" = lançamento futuro projetado.
"InvoiceItem"(id, "financeEntryId", name, category, amount, quantity, "unitPrice") — itens de nota fiscal de mercado.
"SavingsGoal"(id, name, "targetAmount", "currentAmount", deadline)
"Budget"(id, month 'AAAA-MM'|'default', category, subcategory, amount)`;
  const sqlPrompt = `${schema}
Hoje é ${today.toISOString().slice(0, 10)}. Escreva UMA consulta SQL PostgreSQL (somente SELECT, pode usar WITH) que responda: "${question}".
Use ILIKE para buscar texto em description/category/subcategory. Limite a 50 linhas.
Regras do Renato: "gastei"/"comprei" = type 'expense' com QUALQUER status (compra no cartão fica 'pending' até a fatura: NÃO filtre status, a menos que a pergunta fale de pago/a pagar).
Para gastos por período use a data da compra: COALESCE("purchaseDate", date). Mercado = subcategory 'Supermercado' (category 'Alimentação'). Parcelas têm "Parcela X/Y" na description; "quanto falta pagar das parcelas" = SUM(amount) com type 'expense', status 'pending' e description ILIKE '%Parcela %' (todos os meses à frente, sem limitar ao mês atual).
Se a pergunta NÃO disser o período, considere só o mês atual (date dentro do mês de hoje). Nunca some meses futuros
(lançamentos projetados) a menos que a pergunta peça explicitamente o futuro ("quanto falta pagar", "até o fim do ano"...). Responda APENAS com o SQL, sem markdown e sem explicação.`;

  let sql = "";
  try {
    const { content } = await generateResponse([{ role: "user", content: sqlPrompt }], "Você escreve SQL PostgreSQL correto e seguro.", 0, 400, providerOpts);
    sql = content.replace(/```sql|```/gi, "").trim().replace(/;\s*$/, "");
  } catch (err) {
    console.error("[finance_question] a IA não respondeu:", err instanceof Error ? err.message.slice(0, 160) : err);
    return "⚠️ Não consegui pensar na consulta agora. Tenta perguntar de outro jeito?";
  }

  if (!sqlSeguro(sql)) {
    console.error("[finance_question] SQL recusado", sql);
    return "⚠️ Não consegui montar uma consulta segura para essa pergunta. Tenta de outro jeito?";
  }

  let rows: unknown[] = [];
  try {
    rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = 5000");
      return tx.$queryRawUnsafe<unknown[]>(sql);
    });
  } catch (err) {
    console.error("[finance_question] erro ao consultar", err, sql);
    return "⚠️ Não consegui buscar isso no banco. Tenta perguntar de outro jeito?";
  }

  const data = JSON.stringify(rows.slice(0, 50), (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  onConta?.({ sql, linhas: JSON.parse(data) });
  try {
    const { content } = await generateResponse(
      [{ role: "user", content: `Pergunta: "${question}"\nResultado da consulta (JSON): ${data}\n\nResponda em português, curto (até 6 linhas), com a conclusão primeiro e os números em R$. Se o resultado estiver vazio, diga que não encontrou lançamentos.` }],
      "Você é a secretária financeira pessoal do Renato. Responda só com base nos dados recebidos, sem inventar números.",
      0.2,
      300,
      providerOpts
    );
    return `🧠 ${content.trim()}`;
  } catch {
    return `🧠 Encontrei ${rows.length} resultado(s), mas não consegui resumir agora.`;
  }
}

// O que a secretária sabe fazer, com a frase que aciona cada coisa. Usado na
// conversa ("o que você faz?", "como vejo X?") — ao criar função nova, inclua aqui.
export const ASSISTANT_MANUAL = `💸 Lançar gasto ou receita (texto ou áudio): "gastei 45 no mercado", "recebi 3000 de salário", "comprei um celular de 291 em 17x".
  Depois do gasto ela pergunta o meio de pagamento: responder "2" pix, "3" débito, "4" dinheiro. Para mudar a data da compra, responder só o dia ("15/08").
📸 Qualquer print (pedido do Mercado Livre, comprovante de Pix, recibo, estorno...): ela entende o que é, mostra o lançamento e pergunta "sim/não" antes de salvar. Nota fiscal e fatura ela reconhece sozinha.
🧐 Gasto a partir de R$ 500 (somando as parcelas): ela confere com você ("sim"/"não") antes de lançar.
🧾 Foto de nota fiscal de mercado: lança o gasto, guarda cada item e avisa se algum produto ficou mais caro.
💳 Print ou PDF de fatura/extrato: importa todos os lançamentos de uma vez (se a fatura tiver mais de um cartão — titular e adicionais — ela pergunta quais importar: número, nome ou "tudo"). PDF com senha: ela pede a senha e ele responde só com ela.
📊 "Quanto gastei esse mês?" — entradas, saídas e quanto sobra no mês.
🎯 "Como está meu orçamento?" — cada categoria com teto: 🟢 tranquilo, 🟡 passou de 70%, 🔴 estourou (com gráfico). Ao lançar um gasto ou importar a fatura, ela avisa a partir de 70% e mostra a previsão do mês (sobra ou falta, e se vai sair da Reserva).
🍔 VR (vale): "gastei 45 no almoço no VR" lança na conta do VR; "quanto tenho no VR?" mostra o saldo e quanto dá pra gastar por dia.
🛍️ Lista de desejos: "quero comprar um tênis de 300 em 3x" anota e diz se cabe; "minha lista de desejos" mostra tudo; ela avisa sozinha quando um desejo passar a caber.
🕓 "Histórico do aluguel" / "por que a luz mudou?" / "o que mudou hoje?" — cada mudança no lançamento (valor, data, situação…) com o motivo; "desfaz a mudança 2" volta uma delas.
🚦 "Como está o sistema?" — WhatsApp conectado, última mensagem recebida, ponte da tomada, crédito da IA e há quanto tempo está no ar. Se o WhatsApp cair, a Alexa avisa; quando volta, chega a mensagem.
✏️ Corrigir um lançamento antigo: *responda* (citando) a mensagem dele com "foi no pix", "era 32,50", "foi dia 15/10" ou "apaga" — ela mostra a mudança e espera o "sim".
✂️ Pagou parte em cada (nota ou gasto): "100 no VR e 80 no cartão" ou "25 no vale antigo e o resto no cartão" — na legenda da foto da nota, logo depois dela, ou respondendo à mensagem do lançamento.
🧪 "Testa a ia" — laboratório com mensagens e textos inventados: quantas a IA acertou, tempo e custo; "testa a ia com <modelo>" compara um candidato antes de trocar.
🧮 "Por que meu limite é esse?" — a conta do limite do cartão aberta: entradas, fatura, contas e o que sobra por dia.
📦 Vários pedidos numa mensagem: "gastei 25 no mercado, registra 120 km na scooter e me lembra de calibrar sábado" — ela separa e faz um por um (gasto a partir de R$ 500 vai sozinho, para confirmar).
📏 Regras de categoria: "regra: farmácia pague menos é Saúde › Farmácia" (vale antes da IA); "minhas regras" lista e sugere lojas que você corrigiu várias vezes; "apaga regra 2".
🛒 "O que preciso comprar?" — pelas notas fiscais: o que você compra sempre e já passou do intervalo de costume.
🏷️ "Preço do café" / "o café ficou mais caro?" — compara por quilo/litro (pega o tamanho do nome do item), não só pelo preço da embalagem.
📥 Caixa de ideias e links: "guarda: …", "guarda esse link https://…", "ideia: …"; "o que eu guardei sobre X?", "minhas notas", "apaga nota 3".
📊 "Uso da extensão" — quantas vezes você usou cada função da Central (botões de IA, ⚡, corretor, CRM…) e o que nunca usou. Atalhos de texto não entram.
👀 "O que precisa da minha atenção?" (ou "pendências") — só o que pede ação: contas vencendo ou atrasadas, salário sem baixa, mês no vermelho, perguntas esperando sua resposta, lembretes de hoje e crédito da IA.
📋 "O que falta pagar?" — contas do mês com 🔴 vencida / 🟡 vence logo, e a fatura do cartão numa linha só. Às 9h ela avisa sozinha o que vence em até 3 dias.
📂 "Como está meu gasto com moradia?" (ou mercado, luz, transporte...) — total da categoria no mês, comparação com o mês passado e gráfico.
🎯 "Por que estourei o mês?" / "Como está meu mês?" — diagnóstico com a causa principal e gráfico por categoria.
📅 "Fechamento do mês" — como fechou o mês passado, com gráfico.
📈 Gráfico quando pedir: "gráfico dos gastos" (mês por categoria), "gráfico de entradas e saídas" (6 meses), "gráfico do mercado" (uma categoria), "gráfico das metas".
💳 Pagou a fatura do cartão? "paguei a fatura" (ou "paguei a fatura do Santander") dá baixa em todas as compras dela de uma vez; no painel tem o botão "Marcar como paga".
↩️ Corrigir o último lançamento: "desfazer" apaga; "na verdade foi 250" troca o valor. Gasto sem valor ("gastei com uber"): ela pergunta quanto foi.
🔁 "Quanto gasto com assinaturas?" — contas fixas e assinaturas.
❓ Pergunta livre sobre os números: "quanto gastei com Uber em setembro?", "qual minha maior compra no cartão?", "quanto falta pagar do Samsung?".
🛒 Simulador: "posso comprar um tênis de 200 em 3x?", "e se meu salário for 3300?".
🏆 Metas: "quero juntar 3000 pra viagem até julho" cria a meta e diz quanto guardar por mês; "como estão minhas metas?" (com gráfico e se cabem na sobra), "guarda 100 na reserva", "tirei 900 da reserva". Depois do salário ela sugere quanto guardar — responder "guarda".
📅 Compromissos das conversas: quando alguém combina algo com ele no privado ("treino amanhã às 7"), ela pergunta e "agenda" salva com lembrete; "silencia fulano" / "volta a ouvir fulano".
🗓️ Agenda e lembretes: "reunião amanhã às 14h", "lembrar de pagar o cartão sexta", "o que tenho pendente?".
🎫 Chamados e grupos: "quais chamados estão abertos?", "resumo do grupo PJe".
📔 Diário: contar como foi o dia ("hoje foi puxado, fiquei cansado...") — ela guarda com o humor.
🖥️ Painel web: tudo isso também aparece no painel (financeiro, metas, agenda, diário).`;

/**
 * Conversa: cumprimento, dúvida de como usar ou mensagem ambígua. Responde
 * com naturalidade e, quando ajudar, ensina a frase que aciona a função.
 * Nada é registrado aqui.
 */
export async function answerChat(message: string, recentContext: string | undefined, ownerName: string, providerOpts: ProviderOptions): Promise<string> {
  const system = `Você é a secretária pessoal de ${ownerName} no WhatsApp. Ele fala com você mandando mensagem para o próprio número.
Converse de forma natural e calorosa, em português simples, curto (até 6 linhas), com emoji moderado.

O que você sabe fazer (e a frase que aciona cada coisa):
${ASSISTANT_MANUAL}

Regras:
- Se ele perguntar o que você faz ou como fazer algo, explique com as suas palavras e mostre a frase exata entre *asteriscos* para ele mandar.
- Se a mensagem for ambígua, diga o que entendeu, pergunte o que ele quis dizer e sugira 1 ou 2 frases do manual que resolvem.
- Nunca diga que registrou, lançou ou anotou algo: nesta conversa nada foi salvo. Se ele quis registrar, mostre a frase certa.
- Não invente funções que não estão na lista; se não souber fazer, diga com sinceridade.
- Não dê sermão sobre horário, sono, bebida ou saúde.`;
  const prompt = `${recentContext ? `Conversa recente:\n${recentContext}\n\n` : ""}Mensagem dele agora: "${message}"`;
  try {
    const { content } = await generateResponse([{ role: "user", content: prompt }], system, 0.6, 400, providerOpts);
    return content.trim() || "🙂 Não entendi bem. Me manda *\"o que você faz?\"* que eu te mostro tudo que sei fazer.";
  } catch {
    // Sem resposta da IA (fora do ar, sem crédito): não culpar a frase dele.
    return "⚠️ A IA não respondeu agora (pode estar fora do ar). Tenta de novo daqui a pouco.";
  }
}
