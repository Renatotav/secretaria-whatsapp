import { prisma } from "./prisma";
import { sendTextWithTyping, sendWhatsAppImage, getBase64FromMediaMessage, fetchGroupInfo, findContact } from "./evolution";
import { barChartPng, progressChartPng } from "./chart";
import { generateResponse, transcribeAudio, type ProviderOptions, VISION_FALLBACK } from "./openai";
import { analyzePrivateMessage, detectCommitment } from "./analyzer";
import { classifyGroupMessage } from "./classifier";
import { parseInvoiceImage, parseStatementEntries, parseStatementImage, readImage, routePersonalMessage, type InvoiceEntry, type PersonalQueryIntent, type PersonalRouteResult, type StatementEntry } from "./personal-router";
import { extractAndSaveTickets } from "./ticket-extractor";
import { parseLocalDate, todayBRT, creditCardBillDate, billDaysFor, cardInText, autoEntryDates } from "./dates";
import { loadFlowStates, saveFlowStates, markFlowStatesLoaded } from "./flow-state";
import { withReason } from "./finance-reason";
import { isBesteiraItem, merchantKey, normalizeItemCategory, spreadDiscount } from "./finance-taxonomy";
import type { AgentConfig, Prisma } from "@prisma/client";
import { applyOutlookCommand } from "./outlook-calendar";
import { applyAirconCommand } from "./aircon";
import { applySaidasCommand } from "./saidas";
import { brlMsg as brl } from "./format";
import { applyAlertRuleCommand } from "./work-alert-rules";
import { applyAiLabCommand } from "./ai-lab";
import { applyWorkCommand } from "./work-commands";
import { invoiceLabel, listOpenInvoices, payInvoice } from "./invoices";
import { applyExtrasCommand, categoryRuleFor } from "./personal-extras";
import { replyCapture } from "./reply-capture";
import { TIRE_PSI, applyScooterCommand, scooterDigestLine, scooterNumbers } from "./scooter";
import { applyYoutube } from "./youtube";
import { applyCreditCommand, creditWarning } from "./ai-credit";
import { applyUsageCommand } from "./work-usage";
import { extractPdfText, holderMatches, pdfPasswordError, splitCardSections } from "./pdf";
import { fetchNfce, repairNfeKey } from "./nfce";
import { workDigestLine, workWeekSection } from "./work";
import { addMonths, baseName, budgetIcon, budgetStatus, dayRange, dueBetween, formatDayMonth, isInstallment, isoDay, isRecurring, MESES_FALA, MONTH_NAMES, monthForecast, monthForecastParts, monthTotals, reaisFala, SALARY_REPLY_MARK, SO_SALARIO, spentBetween, WEEKDAYS } from "./finance-common";
import { applyInvoiceDates, budgetAlertsAfterImport, projectAndInsertFinanceEntries } from "./statement-import";
import { getEvoConfig } from "./evolution-config";
import { sendBudgetChart, sendCategoryChart, sendGoalsChart, sendIncomeExpenseChart, sendMonthChart } from "./finance-charts";
import { buildWishList, checkWish, levelIcon, wishLabel } from "./finance-wishes";
import type { WishVerdict } from "./finance-wishes";
import { findReserveGoal, goalMonthlyNeed, goalsViabilityLine, reserveNow } from "./finance-goals";
import { billsDueSpeech, buildBillsDue, buildCategorySummary, buildDailyDigest, buildMonthClosing, buildQueryResponse, buildWeeklyDigest, cardLimitData, cardLimitLine, cardLimitSpeech, limitChallengeLine, monthForecastLine, salaryCheckup } from "./finance-reports";
import { getProviderOpts, notifyOwner } from "./owner-notify";
import { NUMBER_PART, PAYMENT_NAMES, PAYMENT_OPTIONS, entryCard, fmtBRT, formatFullDate, formatTime, parseBrNumber, paymentLabel } from "./finance-text";
import { handleGroupMessage } from "./group-messages";
import type { GroupMessageMeta } from "./group-messages";
import { downloadIncomingMedia, transcribeIncomingAudio } from "./incoming-media";
import { simulateFinance } from "./finance-simulator";
import { describeChange, histLine, undoFinanceLog } from "./finance-history";
import type { QuotedChange } from "./finance-history";
import { applySplit, parseSplit, splitTransactions } from "./finance-split";
import type { SplitPart } from "./finance-split";
import { applyQuotedEdit, entryFromQuoted, parseQuotedChange } from "./quoted-reply";
import { answerChat, answerFinanceQuestion } from "./assistant-chat";
export { parseSplit };
export { sendGoalsChart };
export { downloadIncomingMedia, transcribeIncomingAudio };
export { handleGroupMessage };
export type { GroupMessageMeta };
export { formatTime };
export { getProviderOpts, notifyOwner };
export { billsDueSpeech, buildBillsDue, buildDailyDigest, buildMonthClosing, buildWeeklyDigest, cardLimitData, cardLimitLine, cardLimitSpeech, limitChallengeLine, salaryCheckup };
export { reserveNow };
export { checkWish };
export type { WishVerdict };
export { SO_SALARIO };
export { sendBudgetChart, sendMonthChart };
export { projectAndInsertFinanceEntries };

export function extractText(message: Record<string, unknown>): string {
  return (
    (message.conversation as string) ??
    (message.extendedTextMessage as Record<string, string>)?.text ??
    (message.imageMessage as Record<string, string>)?.caption ??
    ""
  );
}

/** Aviso do dia: desejo que passou a caber (🟢) — uma vez por mês por item. */
export async function notifyAffordableWishes(config: AgentConfig): Promise<void> {
  if (!config.ownerPhone) return;
  const today = todayBRT();
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const wishes = await prisma.wishItem.findMany({ where: { status: "wish", notifiedMonth: { not: monthKey } } });
  for (const w of wishes) {
    const v = await checkWish(w);
    if (v.level !== "green") continue;
    await prisma.wishItem.update({ where: { id: w.id }, data: { notifiedMonth: monthKey } });
    await notifyOwner(config, `🛍️ *Boa notícia:* ${wishLabel(w)} — ${v.text}\nSe comprar, me conta ("comprei o ${w.name.toLowerCase()}...") que eu lanço e tiro da lista.`);
  }
}

/** Quanto gastou hoje, falado (tudo: cartão, pix e vales). */
export async function spentTodaySpeech(): Promise<string> {
  const { gte, lte } = dayRange(todayBRT());
  const spent = await spentBetween(gte, lte);
  const total = spent.reduce((acc, e) => acc + e.amount, 0);
  return total >= 1 ? `Hoje você gastou ${reaisFala(total)}.` : "Hoje você não gastou nada.";
}

/**
 * "quanto gastei hoje/ontem?" (WhatsApp e Alexa): o dia, não o mês — o
 * roteador mandava para o resumo do mês inteiro. Sem IA.
 */
export async function applySpentDayCommand(text: string): Promise<string | null> {
  const m = text.trim().match(/^\s*(?:e\s+)?quanto\s+(?:eu\s+)?(?:j[aá]\s+)?gastei\s+(hoje|ontem)\s*\??\s*$/i);
  if (!m) return null;
  const ontem = m[1].toLowerCase() === "ontem";
  const t = todayBRT();
  const dia = ontem ? new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1, 12) : t;
  const { gte, lte } = dayRange(dia);
  const spent = await spentBetween(gte, lte);
  const total = spent.reduce((acc, e) => acc + e.amount, 0);
  const quando = ontem ? "Ontem" : "Hoje";
  if (!spent.length) return `🙌 ${quando} você não gastou nada.

${await cardLimitLine()}`;
  const itens = spent.slice(0, 8).map((e) => `• ${(e.description.replace(/\s*-?\s*Parcela.*$/, "").trim() || e.subcategory || e.category)}: ${brl(e.amount)}`);
  return `💸 ${quando} você gastou ${brl(total)}:
${itens.join("\n")}${spent.length > 8 ? "\n…" : ""}

${await cardLimitLine()}`;
}

// ── Histórico do financeiro (FinanceLog, gravado sozinho em prisma.ts) ──────
// "histórico do aluguel", "por que a luz mudou?", "o que mudou hoje?" e
// "desfaz a mudança 2" (o número da última lista mostrada).
let lastHistoryIds: string[] | null = null;
export async function applyHistoryCommand(text: string): Promise<string | null> {
  const t = text.trim();
  const undo = t.match(/^desfa(?:z|ça|ca|zer)\s+(?:a\s+)?mudan[cç]a\s+(\d{1,2})[.!]?$/i);
  if (undo) {
    const id = lastHistoryIds?.[Number(undo[1]) - 1];
    if (!id) return "Não achei essa mudança. Peça o histórico de novo (\"histórico do aluguel\", \"o que mudou hoje?\") e use o número da lista.";
    return withReason(`desfazer a mudança ${undo[1]} do histórico`, () => undoFinanceLog(id));
  }
  let where: Record<string, unknown> | null = null;
  let titulo = "";
  if (/^(?:o\s+)?q(?:ue)?\s+mudou(?:\s+(?:hoje|no\s+financeiro(?:\s+hoje)?))?\??$|^mudan[cç]as\s+de\s+hoje\??$/i.test(t)) {
    const hj = todayBRT();
    where = { at: { gte: new Date(Date.UTC(hj.getFullYear(), hj.getMonth(), hj.getDate(), 3)) } };
    titulo = "🕓 *O que mudou hoje no financeiro*";
  } else {
    const m = t.match(/^hist[oó]rico\s+(?:d[oae]s?\s+)?(.{2,60}?)\??$/i) || t.match(/^por\s*que\s+(?:o\s+|a\s+|os\s+|as\s+)?(.{2,60}?)\s+mudou\??$/i);
    if (!m) return null;
    where = { description: { contains: m[1].trim(), mode: "insensitive" } };
    titulo = `🕓 *Histórico: ${m[1].trim()}*`;
  }
  const logs = await prisma.financeLog.findMany({ where, orderBy: { at: "desc" }, take: 10 });
  if (!logs.length) return `${titulo}\nNada registrado. (O histórico começou a ser gravado em 22/10/2026.)`;
  lastHistoryIds = logs.map((l) => l.id);
  return `${titulo}\n\n${logs.map((l, i) => histLine(i + 1, l)).join("\n")}\n\nPara voltar uma mudança: *desfaz a mudança N*.`;
}

let pendingQuotedEdit: { entryId: string; change: QuotedChange; at: number } | null = null;
let pendingSplit: { entryId: string; parts: SplitPart[]; at: number } | null = null;
let lastNotaEntry: { id: string; at: number } | null = null;

/** Resposta citando uma mensagem antiga. null = não é o caso (segue o fluxo normal). */
async function applyQuotedReply(text: string, quoted: string | undefined): Promise<string | null> {
  if (!quoted) return null;
  // Só correção curta e afirmativa: pergunta ("quanto gastei ontem?") segue o fluxo normal.
  const t = text.trim();
  if (t.length > 80 || /\?\s*$/.test(t)) return null;
  const looksSplit = parseSplit(t, 1_000_000) !== null;
  const change = looksSplit ? null : parseQuotedChange(t);
  if (!looksSplit && !change) return null;
  const e = await entryFromQuoted(quoted);
  if (!e) return /📝|💰|Nota fiscal de R\$/i.test(quoted) ? "🤔 Não achei esse lançamento (pode ter sido apagado ou mudado de valor). Corrija pelo painel ou peça o \"histórico do …\"." : null;
  const label = e.description || e.category;
  const split = looksSplit ? parseSplit(t, e.amount) : null;
  if (split && "erro" in split) return `✂️ ${split.erro}`;
  if (split) {
    pendingSplit = { entryId: e.id, parts: split, at: Date.now() };
    return `✂️ Dividir "${label}" (${brl(e.amount)}) assim?\n${split.map((p) => `• ${brl(p.amount)} no ${p.label}`).join("\n")}\nResponda *sim* ou *não*.`;
  }
  if (!change) return null;
  const desc = describeChange(e, change);
  if (!desc) return `👍 "${label}" já está assim.`;
  pendingQuotedEdit = { entryId: e.id, change, at: Date.now() };
  const parcela = /Parcela \d+\/\d+/.test(e.description) ? "\n(Só esta parcela muda.)" : "";
  return `✏️ Em "${label}" (${brl(e.amount)}, ${formatFullDate(e.purchaseDate ?? e.date)}): ${desc}.${parcela}\nConfirma? Responda *sim* ou *não*.`;
}

// "por que meu limite é esse?": a mesma conta do limite do cartão, aberta em
// partes, com os números do banco (sem IA, nada inventado).
const EXPLAIN_LIMIT_RE = /^\s*(?:por\s*qu[eê]\s+(?:o\s+|meu\s+)?limite|como\s+(?:voc[eê]\s+)?(?:calculou|chegou\s+(?:n[oa]|a[oa]?))\s+(?:o\s+|meu\s+)?limite|explica\s+(?:o\s+|meu\s+)?limite|de\s+onde\s+vem\s+(?:o\s+|meu\s+)?limite)/i;

export async function applyExplainLimitCommand(text: string): Promise<string | null> {
  if (!EXPLAIN_LIMIT_RE.test(text)) return null;
  const { left, close, days, month, note } = await cardLimitData();
  const config = await prisma.agentConfig.findFirst({ select: { creditCardDueDay: true, creditCardBestDay: true } });
  const bill = creditCardBillDate(todayBRT(), config?.creditCardDueDay || 10, config?.creditCardBestDay || 5);
  const y = bill.getFullYear(), m = bill.getMonth();
  const entries = await prisma.financeEntry.findMany({
    where: { date: { gte: new Date(y, m, 1), lte: new Date(y, m + 1, 0, 23, 59, 59) } },
    select: { type: true, amount: true, account: true, status: true, paymentMethod: true, card: true, description: true, category: true },
  });
  const conta = entries.filter((e) => !/vr|ticket|vale/i.test(e.account));
  const nome = (e: { description: string; category: string }) => e.description.replace(/\s*\((previsto|recorrente)\)/gi, "").replace(/\s*-?\s*Parcela.*$/i, "").trim().slice(0, 40) || e.category;
  const soma = (xs: typeof conta) => xs.reduce((a, e) => a + (e.type === "income" ? e.amount : -e.amount), 0);
  const entradas = conta.filter((e) => e.type === "income" && e.paymentMethod !== "cartão");
  const fatura = conta.filter((e) => e.paymentMethod === "cartão" && !e.card);
  const outros = conta.filter((e) => e.paymentMethod === "cartão" && e.card);
  const contas = conta.filter((e) => e.type === "expense" && e.paymentMethod !== "cartão");
  const top = (xs: typeof conta, n = 4) => {
    const g = new Map<string, number>();
    for (const e of xs) g.set(nome(e), (g.get(nome(e)) ?? 0) + e.amount);
    const arr = [...g].sort((a, b) => b[1] - a[1]);
    return arr.slice(0, n).map(([k, v]) => `   · ${k}: ${brl(v)}`).concat(arr.length > n ? [`   · e mais ${arr.length - n}`] : []);
  };
  const linhas = [
    `🧮 *Como saiu o limite de ${brl(left)}* (mês de ${month}, conta corrente; VR fica fora${note ? "; com o salário estimado" : ""})`,
    "",
    `➕ Entradas: ${brl(soma(entradas))}`,
    ...top(entradas, 3),
    `➖ Fatura do seu cartão (vence ${formatDayMonth(bill)}): ${brl(-soma(fatura))}`,
    ...top(fatura.filter((e) => e.type === "expense")),
    ...(outros.length ? [`➖ Outros cartões: ${brl(-soma(outros))}`, ...top(outros, 2)] : []),
    `➖ Contas e outros gastos: ${brl(-soma(contas))}`,
    ...top(contas),
    "",
    `= *${brl(left)}* ${left >= 0 ? "sobrando" : "faltando"}${left > 0 ? ` · ${days} dias até ${formatDayMonth(close)} (fechamento) → ≈ ${brl(left / days)}/dia` : ""}`,
    "Conta: entradas − tudo que sai da conta corrente nesse mês (pago ou a pagar). Compras novas no cartão até o fechamento caem nessa fatura e diminuem o limite.",
  ];
  return linhas.join("\n");
}

// ── Vários pedidos numa mensagem ───────────────────────────────────────────
// "Gastei 25 no mercado, registra 120 km na scooter e me lembra de calibrar
// sábado": separa onde começa um pedido novo e faz um por um. Só separa se
// TODOS os pedaços parecem pedidos completos ("almoço" + "25" continua junto).
const MULTI_VERB = String.raw`(?:me\s+lembr[ae]|lembr[ae]-?me|registra|anota|lan[cç]a|gastei|paguei|comprei|recebi|marca|agenda)`;
export function splitRequests(text: string): string[] {
  const pieces = text
    .split(new RegExp(String.raw`\n+|;\s*|,\s*(?=${MULTI_VERB}\b)|\s+e\s+(?=${MULTI_VERB}\b)`, "i"))
    .map((p) => p.trim().replace(/[.!]+$/, "").trim())
    .filter(Boolean);
  if (pieces.length < 2 || pieces.length > 6) return [];
  const pedido = (p: string) =>
    p.length <= 120 &&
    (new RegExp(String.raw`^${MULTI_VERB}\b`, "i").test(p) ||
      (/\b(scooter|moto)\b/i.test(p) && /\d/.test(p)) ||
      /^[\p{L}\s]{2,40}?\s(?:de\s+|no\s+|na\s+)?(?:r\$\s*)?\d+(?:[.,]\d{1,2})?\b/iu.test(p));
  if (!pieces.every(pedido)) return [];
  // Gasto alto (≥ R$ 500) pede "sim": manda sozinho, senão o "sim" se perde entre os pedidos.
  if (pieces.some((p) => [...p.matchAll(/\d+(?:\.\d{3})*(?:,\d{1,2})?/g)].some((m) => parseBrNumber(m[0]) >= HIGH_VALUE && !/km\b/i.test(p)))) return [];
  return pieces;
}

const ATTENTION_RE = /^\s*(?:(?:o\s*)?q(?:ue)?\s+(?:é\s+que\s+)?(?:precisa|tem|falta)\s+(?:de\s+)?(?:da\s+)?(?:minha\s+aten[cç][aã]o|(?:pra|para)\s+eu\s+(?:fazer|resolver|ver)|eu\s+(?:fazer|resolver|ver))|(?:minhas\s+)?pend[eê]ncias|tem\s+alguma\s+pend[eê]ncia)\s*\??\s*$/i;

/**
 * "o que precisa da minha atenção?": só o que pede uma ação dele — contas
 * vencendo ou atrasadas, salário sem baixa, limite do cartão estourado,
 * perguntas esperando resposta, lembretes de hoje e crédito da IA. Sem IA.
 */
export async function applyAttentionCommand(text: string): Promise<string | null> {
  if (!ATTENTION_RE.test(text)) return null;
  const parts: string[] = [];

  const bills = await buildBillsDue("reminder");
  if (bills) parts.push(bills.replace(/\nJá pagou\?[\s\S]*$/, ""));

  const t = todayBRT();
  const salario = await prisma.financeEntry.findFirst({
    where: { type: "income", status: "pending", category: "Salário", ...SO_SALARIO, date: { gte: new Date(t.getFullYear(), t.getMonth(), 1), lt: new Date(t.getFullYear(), t.getMonth(), t.getDate()) } },
    orderBy: { date: "asc" },
  });
  if (salario) parts.push(`💼 Salário de ${formatDayMonth(salario.date)} ainda sem baixa (previsto ${brl(salario.amount)}). Quando cair, mande "recebi X de salário".`);

  const lim = await cardLimitData();
  if (lim.left < 0) parts.push(`🔴 O mês de ${lim.month} está ${brl(-lim.left)} no vermelho${lim.note}. Segure o cartão até ${formatDayMonth(lim.close)}.`);

  const fresh = (at: number, min: number) => Date.now() - at < min * 60 * 1000;
  const waiting: string[] = [];
  if (pendingHighValue && fresh(pendingHighValue.at, 30)) waiting.push(`gasto alto esperando "sim": ${pendingHighValue.text}`);
  if (pendingInvoiceDraft && fresh(pendingInvoiceDraft.at, 60)) waiting.push(`nota fiscal de ${brl(pendingInvoiceDraft.invoice.total)} esperando "soma" ou o total certo`);
  if (pendingImageDraft && fresh(pendingImageDraft.at, 60)) waiting.push(`print esperando "sim" para lançar`);
  if (pendingStatement && fresh(pendingStatement.at, 60)) waiting.push("fatura esperando você escolher o cartão");
  if (pendingAmount && fresh(pendingAmount.at, 30)) waiting.push(`faltou o valor de: ${pendingAmount.text}`);
  if (pendingCommitment && fresh(pendingCommitment.at, 24 * 60)) waiting.push(`compromisso para pôr na agenda: ${pendingCommitment.title}`);
  if (waiting.length) parts.push(`❓ *Esperando sua resposta*\n${waiting.map((w) => `• ${w}`).join("\n")}`);

  const ini = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate(), 3)); // 00:00 em Brasília
  const lembretes = await prisma.agendaItem.findMany({ where: { source: { not: "group" }, done: false, dueDate: { gte: ini, lt: new Date(ini.getTime() + 86_400_000) } }, orderBy: { dueDate: "asc" }, take: 8 });
  if (lembretes.length) parts.push(`📅 *Hoje*\n${lembretes.map((l) => `• ${l.dueDate ? formatTime(l.dueDate.getTime() / 1000) + " " : ""}${l.title}`).join("\n")}`);

  const credito = await creditWarning().catch(() => "");
  if (credito) parts.push(credito);

  return parts.length ? `👀 *Precisa da sua atenção*\n\n${parts.join("\n\n")}` : "✅ Nada precisa de você agora. Tudo em dia!";
}

/**
 * Respostas FALADAS (Alexa): frases curtas, sem centavos e sem símbolos — o
 * texto do WhatsApp lido em voz alta soava como extrato. null = sem fala pronta
 * para isso (aí vai o caminho normal, convertido por paraFala).
 */
export async function spokenAnswer(text: string): Promise<string | null> {
  // A Alexa ouve "VR" como "BR", "vê erre" ou "tempo BR" ("quanto tenho no VR").
  const t = text.trim().toLowerCase()
    .replace(/\bv[eê]\s*err?e\b/g, "vr")
    .replace(/\b(tempo|tenho)\s+(n[oa]\s+)?br\b/g, "tenho no vr")
    .replace(/\bno\s+br\b/g, "no vr");
  // "o que precisa da minha atenção?": versão falada curta (o texto do WhatsApp é longo).
  if (ATTENTION_RE.test(t)) {
    const txt = (await applyAttentionCommand(t)) || "";
    if (/Nada precisa de você/.test(txt)) return "Nada precisa de você agora. Tudo em dia.";
    const partes: string[] = [];
    const contas = (txt.match(/^[🔴🟡⚪] .+$/gmu) || []).length;
    if (contas) partes.push(`${contas} ${contas === 1 ? "conta vencendo" : "contas vencendo"}`);
    if (/Salário de/.test(txt)) partes.push("o salário ainda sem baixa");
    if (/no vermelho/.test(txt)) partes.push("o mês no vermelho");
    const esperando = txt.split("Esperando sua resposta")[1]?.split("\n\n")[0].split("\n").filter((l) => l.startsWith("•")).length ?? 0;
    if (esperando) partes.push(`${esperando} ${esperando === 1 ? "pergunta esperando" : "perguntas esperando"} sua resposta`);
    const hoje = txt.split("*Hoje*")[1]?.split("\n\n")[0].split("\n").filter((l) => l.startsWith("•")).length ?? 0;
    if (hoje) partes.push(`${hoje} ${hoje === 1 ? "lembrete" : "lembretes"} para hoje`);
    if (/Crédito da IA/.test(txt)) partes.push("o crédito da IA baixo");
    return partes.length ? `Você tem ${partes.length > 1 ? partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1] : partes[0]}. Os detalhes estão no WhatsApp.` : "Nada urgente agora.";
  }
  // Ação (lançar, pagar, lembrar…) não é pergunta: segue o caminho normal da secretária.
  if (/^\s*(anota|anote|lan[cç]a|paguei|pago|gastei|comprei|recebi|caiu|marca|me lembra|lembra|agenda\s+\w+\s+(dia|amanh|hoje|às)|tirei|guarda|calibrei|carreguei|desfazer|na verdade)/.test(t) && !/^\s*gastei\s+(hoje|ontem)\s*\??$/.test(t)) return null;
  const r = (v: number) => `${Math.round(Math.abs(v)).toLocaleString("pt-BR")} ${Math.round(Math.abs(v)) === 1 ? "real" : "reais"}`;
  const { left, close } = await cardLimitData();
  const ate = `${close.getDate()} de ${MESES_FALA[close.getMonth()]}`;
  const cartao = left >= 1 ? `No cartão ainda cabem ${r(left)} até ${ate}.` : `O cartão já passou do salário em ${r(left)}, segura até ${ate}.`;

  const dia = t.match(/gastei\s+(hoje|ontem)/);
  if (dia) {
    const ontem = dia[1] === "ontem";
    const hj = todayBRT();
    const d = ontem ? new Date(hj.getFullYear(), hj.getMonth(), hj.getDate() - 1, 12) : hj;
    const { gte, lte } = dayRange(d);
    const gastos = await spentBetween(gte, lte);
    const quando = ontem ? "Ontem" : "Hoje";
    if (!gastos.length) return `${quando} você não gastou nada. ${cartao}`;
    const total = gastos.reduce((a, e) => a + e.amount, 0);
    const maior = gastos[0];
    const nome = (maior.subcategory || maior.category || "uma compra").toLowerCase();
    return `${quando} você gastou ${r(total)}, em ${gastos.length} ${gastos.length === 1 ? "compra" : "compras"}. ${gastos.length > 1 ? `A maior foi ${nome}, ${r(maior.amount)}. ` : ""}${cartao}`;
  }

  if (/gastei\s+(n?es[st]e|no)\s+m[eê]s|como\s+(est[aá]|t[aá])\s+(o\s+)?meu\s+financeiro|resumo\s+do\s+m[eê]s|como\s+(est[aá]|t[aá])\s+o\s+m[eê]s/.test(t)) {
    const hj = todayBRT();
    const entries = await prisma.financeEntry.findMany({ where: { date: { gte: new Date(hj.getFullYear(), hj.getMonth(), 1), lte: new Date(hj.getFullYear(), hj.getMonth() + 1, 0, 23, 59, 59) } } });
    const soma = (type: string, status?: string) => entries.filter((e) => e.type === type && (!status || e.status === status)).reduce((a, e) => a + e.amount, 0);
    const entradas = soma("income"), saidas = soma("expense");
    const aReceber = entradas - soma("income", "paid"), aPagar = saidas - soma("expense", "paid");
    const saldo = entradas - saidas;
    const f = [`Em ${MESES_FALA[hj.getMonth()]}, entraram ${r(entradas)} e saíram ${r(saidas)}.`];
    if (aReceber >= 1) f.push(`Ainda faltam chegar ${r(aReceber)}.`);
    f.push(aPagar >= 1 ? `Você ainda tem ${r(aPagar)} pra pagar.` : "As contas do mês já estão todas pagas.");
    f.push(saldo < 0 ? `O mês fecha no vermelho em ${r(saldo)}.` : `No fim, sobram ${r(saldo)}.`);
    f.push(cartao);
    return f.join(" ");
  }

  // Limite: "quanto posso gastar?", "quanto ainda cabe no cartão?"
  if (/quanto\s+(ainda\s+)?(posso|d[aá] pra|da para)\s+gastar|quanto\s+(ainda\s+)?cabe|limite/.test(t)) {
    const { vales } = await cardLimitData();
    return `${cartao}${vales >= 1 ? ` E tem ${r(vales)} nos vales para comida.` : " Os vales de comida estão zerados."}`;
  }

  // Vales: "quanto tenho no vr / no vale?"
  if (/\b(vr|vale|vales|ticket)\b/.test(t) && /quanto|saldo|tem/.test(t)) {
    const { vales } = await cardLimitData();
    const prox = await prisma.financeEntry.findFirst({ where: { type: "income", status: "pending", account: "VR" }, orderBy: { date: "asc" } });
    const quando = prox ? ` O próximo crédito, de ${r(prox.amount)}, cai dia ${prox.date.getDate()} de ${MESES_FALA[prox.date.getMonth()]}.` : "";
    return `${vales >= 1 ? `Você tem ${r(vales)} nos vales.` : "Os vales estão zerados."}${quando}`;
  }

  // Fatura: "quanto está a fatura?"
  if (/fatura/.test(t)) {
    const faturas = (await listOpenInvoices()).filter((i) => !i.card && i.total >= 1);
    if (!faturas.length) return "Você não tem fatura em aberto.";
    const f = faturas[0];
    const [, mm, dd] = f.dueDate.split("-").map(Number);
    return `A próxima fatura vence dia ${dd} de ${MESES_FALA[mm - 1]} e está em ${r(f.total)}, com ${f.count} compras. ${cartao}`;
  }

  // Scooter: "como está a scooter?", "quanto dá pra rodar?"
  if (/scooter|moto\b|bateria|quanto\s+d[aá]\s+pra\s+rodar|autonomia/.test(t)) {
    const n = await scooterNumbers();
    if (!n) return "Ainda não tenho registros da scooter.";
    const partes: string[] = [];
    if (n.kmSince !== null) {
      const folga = Math.round(n.safeKm - n.kmSince);
      partes.push(folga <= 0 ? `Carregue hoje: já rodou ${Math.round(n.kmSince)} quilômetros desde a carga.` : `Ela rodou ${Math.round(n.kmSince)} quilômetros desde a carga e ainda tem folga de uns ${folga}.`);
    }
    partes.push(`A autonomia está em uns ${Math.round(n.rangeKm)} quilômetros.`);
    if (n.tireDue) partes.push(`E hoje é dia de calibrar: ${TIRE_PSI.front} na frente e ${TIRE_PSI.rear} atrás.`);
    return partes.join(" ");
  }

  // Contas: "o que vence hoje / amanhã / essa semana?"
  if (/vence|contas?\s+(de|da|pra|para)\s+(hoje|amanh[aã]|semana)/.test(t)) {
    const fala = await billsDueSpeech();
    return fala ? fala.replace(/^Renato,\s*lembrete de contas:\s*/i, "Vencendo: ") : "Nenhuma conta vencendo hoje nem amanhã.";
  }

  // Agenda: "o que tenho hoje / amanhã?", "minha agenda"
  const ag = t.match(/(?:agenda|compromissos?|o que (?:eu )?tenho)\s*(?:de|pra|para)?\s*(hoje|amanh[aã])?/);
  if (ag && /agenda|compromiss|o que (eu )?tenho/.test(t)) {
    const amanha = /amanh/.test(t);
    const hj = todayBRT();
    const d = amanha ? new Date(hj.getFullYear(), hj.getMonth(), hj.getDate() + 1, 12) : hj;
    const ini = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 3));
    const itens = await prisma.agendaItem.findMany({ where: { done: false, dueDate: { gte: ini, lt: new Date(ini.getTime() + 86_400_000) } }, orderBy: { dueDate: "asc" }, take: 4 });
    const quando = amanha ? "Amanhã" : "Hoje";
    if (!itens.length) return `${quando} sua agenda está livre.`;
    const hora = (x: Date) => { const b = new Date(x.getTime() - 3 * 3600_000); const h = b.getUTCHours(), mi = b.getUTCMinutes(); return h === 0 && mi === 0 ? "" : ` às ${h}${mi ? ` e ${mi}` : " horas"}`; };
    return `${quando} você tem: ${itens.map((i) => `${i.title.replace(/[*_]/g, "").slice(0, 60)}${i.dueDate ? hora(i.dueDate) : ""}`).join("; ")}.`;
  }
  return null;
}

/** Véspera da fatura (Alexa, à noite): "Amanhã vence a fatura do seu cartão: 1.234 reais." */
export async function invoiceEveSpeech(): Promise<string> {
  const t = todayBRT();
  const amanha = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
  const key = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, "0")}-${String(amanha.getDate()).padStart(2, "0")}`;
  const faturas = (await listOpenInvoices()).filter((i) => i.dueDate === key && i.total >= 1);
  if (!faturas.length) return "";
  return `Renato, amanhã vence ${faturas.map((f) => `a fatura do ${invoiceLabel(f.card).toLowerCase()}: ${reaisFala(f.total)}`).join("; e ")}. Lembre de pagar inteira.`;
}

export interface SelfMessageMeta {
  messageTimestamp: number;
  /** Texto da mensagem que ele respondeu (citou), quando houver. */
  quoted?: string;
}

const PAYMENT_QUESTION = "Pagou de outro jeito? Responda *2* pix · *3* débito · *4* dinheiro · *5* VR";
const PAYMENT_REPLY_WINDOW_MS = 60 * 60 * 1000;
// A mensagem cita uma data, um mês ou a fatura? Só assim a fatura que a IA
// extraiu ("billDate") passa por cima da regra do melhor dia.
const BILL_STATED_RE = /\d{1,2}\/\d{1,2}|\bfatura\b|\bvencimento\b|\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;
const PAYMENT_STATED_RE = /\b(pix|d[ée]bito|dinheiro|esp[ée]cie|boleto|cart[ãa]o|cr[ée]dito|ticket|vale|vr|va|multi)\b/i;

const UNDO_HINT = "↩️ Errou? Responda *desfazer* ou *na verdade foi 25*.";

/**
 * Resposta curta ("2", "pix", "débito"...) logo depois de um gasto lançado
 * pelo WhatsApp: troca o meio de pagamento só desse lançamento e recalcula a
 * data (cartão vai pro vencimento da fatura; o resto sai no dia da compra).
 * Devolve a mensagem de confirmação, ou null se não for esse caso.
 */
async function applyPaymentReply(text: string, config: AgentConfig): Promise<string | null> {
  const choice = PAYMENT_OPTIONS[text.trim().toLowerCase().replace(/[.!]+$/, "")];
  if (!choice) return null;

  const entry = await prisma.financeEntry.findFirst({
    where: {
      source: "whatsapp",
      type: "expense",
      createdAt: { gte: new Date(Date.now() - PAYMENT_REPLY_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!entry || /Parcela \d+\/\d+/.test(entry.description)) return null;

  const label = entry.description || entry.category;
  if (entry.paymentMethod === choice) {
    return `👍 "${label}" (${brl(entry.amount)}) já estava como ${paymentLabel(entry.paymentMethod, entry.date)}.`;
  }

  const purchase = entry.purchaseDate ?? entry.date;
  const isCard = choice === "cartão";
  const date = isCard
    ? creditCardBillDate(purchase, config.creditCardDueDay || 10, config.creditCardBestDay || 5)
    : purchase;
  await prisma.financeEntry.update({
    where: { id: entry.id },
    // VR = conta do vale; trocar de VR para outro meio volta para a conta principal.
    data: {
      paymentMethod: choice,
      date,
      status: isCard ? "pending" : "paid",
      account: choice === "ticket" ? "VR" : /vr|ticket|vale/i.test(entry.account) ? "Principal" : entry.account,
    },
  });
  return `✅ Corrigido: "${label}" (${brl(entry.amount)}) agora é ${paymentLabel(choice, date)}.`;
}

const SAVINGS_REPLY_MARK = "Responda *guarda*";

/**
 * Fechamento do mês na Reserva — a Reserva é o dinheiro da conta corrente do
 * dono, então anda sozinha nos dois sentidos: mês negativo tira a diferença,
 * mês positivo soma a sobra. Conta só a conta corrente: o VR (cartão de
 * benefício) fica de fora — crédito e gasto do vale não passam pela conta.
 * Uma vez por mês: o mês aplicado fica gravado em AgentConfig.reserveSyncedMonth.
 * Devolve a linha para a mensagem de fechamento ("" se não houver nada).
 */
export async function applyMonthResultToReserve(year: number, monthIndex: number): Promise<string> {
  const key = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const config = await prisma.agentConfig.findFirst({ select: { id: true, reserveSyncedMonth: true } });
  if (!config || config.reserveSyncedMonth >= key) return "";
  const reserve = await findReserveGoal();
  const entries = await prisma.financeEntry.findMany({
    where: {
      date: { gte: new Date(year, monthIndex, 1), lte: new Date(year, monthIndex + 1, 0, 23, 59, 59) },
      NOT: { OR: ["VR", "ticket", "vale"].map((w) => ({ account: { contains: w, mode: "insensitive" as const } })) },
    },
    select: { type: true, amount: true },
  });
  const balance = Math.round(entries.reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), 0) * 100) / 100;
  await prisma.agentConfig.update({ where: { id: config.id }, data: { reserveSyncedMonth: key } });
  if (!reserve || balance === 0) return "";
  const newAmount = Math.max(0, Math.round((reserve.currentAmount + balance) * 100) / 100);
  await prisma.savingsGoal.update({ where: { id: reserve.id }, data: { currentAmount: newAmount } });
  const name = reserve.name.toLowerCase();
  return balance < 0
    ? `\n\n🏦 *${reserve.name}:* na conta corrente, ${MONTH_NAMES[monthIndex]} fechou −${brl(-balance)}, então saiu da ${name}. Agora: ${brl(newAmount)}${newAmount === 0 ? " (zerou!)" : ""}.`
    : `\n\n🏦 *${reserve.name}:* sobrou ${brl(balance)} na conta corrente em ${MONTH_NAMES[monthIndex]}, somei na ${name}. Agora: ${brl(newAmount)}.`;
}


/** "usa nos próximos" logo depois do check-up: troca o salário previsto dos meses seguintes pelo real. */
export async function applySalaryReply(text: string, messages: { role: string; content: string; createdAt: Date }[] | undefined): Promise<string | null> {
  if (!/^\s*(sim,?\s*)?(usa|use|usar|troca|pode trocar)(\s+nos?\s+pr[oó]ximos(\s+meses)?)?\s*[.!]?\s*$/i.test(text)) return null;
  const last = messages?.find((x) => x.role === "assistant");
  if (!last || !last.content.includes(SALARY_REPLY_MARK) || Date.now() - last.createdAt.getTime() > PAYMENT_REPLY_WINDOW_MS) return null;
  const recebido = await prisma.financeEntry.findFirst({ where: { type: "income", category: "Salário", ...SO_SALARIO, status: "paid" }, orderBy: { date: "desc" } });
  if (!recebido) return null;
  const r = await prisma.financeEntry.updateMany({
    where: { type: "income", category: "Salário", ...SO_SALARIO, status: "pending", description: { contains: "(previsto)" }, date: { gt: recebido.date } },
    data: { amount: recebido.amount },
  });
  return `✅ Troquei o salário previsto de ${r.count} mês(es) para ${brl(recebido.amount)}. As previsões e o limite do cartão já usam o valor novo.\n\n${await cardLimitLine()}`;
}

/** Resposta "guarda" logo depois da sugestão acima: soma o valor sugerido na Reserva. */
async function applySavingsReply(
  text: string,
  messages: { role: string; content: string; createdAt: Date }[] | undefined
): Promise<string | null> {
  if (!/^(sim,?\s*)?(pode\s+)?guarda(r)?(\s+sim)?[.!]?$/i.test(text.trim())) return null;
  const lastAssistant = messages?.find((m) => m.role === "assistant");
  if (!lastAssistant || !lastAssistant.content.includes(SAVINGS_REPLY_MARK)) return null;
  if (Date.now() - lastAssistant.createdAt.getTime() > PAYMENT_REPLY_WINDOW_MS) return null;
  const match = lastAssistant.content.match(/guardar \*R\$\s?([\d.]+,\d{2})\*/);
  const reserve = await findReserveGoal();
  if (!match || !reserve) return null;
  const amount = Number(match[1].replace(/\./g, "").replace(",", "."));
  const newAmount = reserve.currentAmount + amount;
  await prisma.savingsGoal.update({ where: { id: reserve.id }, data: { currentAmount: newAmount } });
  return `✅ Guardado ${brl(amount)} na ${reserve.name}!\n💰 ${brl(newAmount)} de ${brl(reserve.targetAmount)} (${((newAmount / reserve.targetAmount) * 100).toFixed(0)}%)${newAmount >= reserve.targetAmount ? "\n🏆 *Meta conquistada!*" : ""}`;
}

// Último lançamento criado por mensagem: "desfazer" e "na verdade foi X" só
// mexem no que foi criado nesse momento (o gasto, ou a série de parcelas).
// Só na memória — depois de um reinício, a correção é pelo painel.
let lastSaved: { since: Date } | null = null;
// Gasto sem valor ("gastei com uber"): guarda a frase e espera o valor.
let pendingAmount: { text: string; at: number } | null = null;

const UNDO_RE = /^(desfaz(er)?|desfa[cç]a|apag(a|ue) (o |esse |este )?([uú]ltimo|lan[çc]amento|gasto)|cancela (o |esse |este )?([uú]ltimo|lan[çc]amento|gasto))[.!]?$/i;
const EDIT_AMOUNT_RE = new RegExp(String.raw`^(na verdade|na real|corrigindo|errei,?)\s*(foi|era|é|e|deu|custou|o valor (foi|era|é))?\s*(r\$\s*)?${NUMBER_PART}\s*(reais|conto|contos)?[.!]?$`, "i");
const AMOUNT_ONLY_RE = new RegExp(String.raw`^(foi\s*)?(r\$\s*)?${NUMBER_PART}\s*(reais|conto|contos)?[.!]?$`, "i");

/** O que foi criado no último lançamento por mensagem (o gasto ou a série de parcelas). */
async function lastSavedEntries() {
  if (!lastSaved) return [];
  return prisma.financeEntry.findMany({
    where: { source: "whatsapp", createdAt: { gte: new Date(lastSaved.since.getTime() - 2000), lte: new Date(lastSaved.since.getTime() + 30_000) } },
    orderBy: { date: "asc" },
  });
}

// Última fatura paga por mensagem ("desfazer" volta as compras para "a pagar").
let lastInvoicePayment: { ids: string[]; at: number } | null = null;
// "paguei a fatura", "fatura paga" — ou a linha que COMEÇA com "cartão" e TERMINA
// em "pago" ("Cartão Santander pago", "Meu cartão 3880,57 pago"). Frases como
// "almoço 30 pago no cartão" são gasto, não pagamento de fatura.
const INVOICE_PAID_RE =
  /\b(paguei|quitei|transferi|mandei|pago|paga)\b.*\bfatura\b|\bfatura\b.*\b(paga|pago|paguei|quitada|transferi)\b|\b(?:paguei|quitei|transferi)\b\s+(?:a\s+fatura\s+d[oe]\s+|o\s+)?cart[aã]o\b|^\s*(?:o\s+)?(?:meu\s+)?cart[aã]o\b[^\n]*\b(?:pago|paga|quitad[ao])\s*[.!]?\s*$/im;

/**
 * "Paguei a fatura" / "transferi a fatura do Santander": dá baixa em todas as
 * compras da fatura mais próxima daquele cartão. O cartão sai das palavras
 * da mensagem (nome do cartão ou de uma compra dele, ex: "santander", "s25");
 * sem pista, é o cartão do dono. Não cria lançamento nenhum.
 */
async function applyInvoicePayment(text: string): Promise<string | null> {
  if (!INVOICE_PAID_RE.test(text) || text.includes("?")) return null;
  // Várias faturas na mesma mensagem, uma por linha ("Cartão Santander pago\nMeu cartão 3880,57 pago").
  const lines = text.split(/\n+/).map((l) => l.trim()).filter((l) => INVOICE_PAID_RE.test(l));
  if (lines.length > 1) {
    const replies: string[] = [];
    const allIds: string[] = [];
    lastInvoicePayment = null;
    for (const line of lines) {
      const r = await applyInvoicePayment(line);
      if (r) replies.push(r.replace(/\n↩️ Foi engano\? Responda \*desfazer\*\./, "").replace(/\nAinda em aberto:[\s\S]*$/, ""));
      // (o TypeScript não vê que a chamada acima muda a variável)
      const paid = lastInvoicePayment as { ids: string[]; at: number } | null;
      if (paid) allIds.push(...paid.ids);
      lastInvoicePayment = null;
    }
    lastInvoicePayment = { ids: [...new Set(allIds)], at: Date.now() };
    return [...replies, "↩️ Foi engano? Responda *desfazer* (desfaz todas)."].join("\n\n");
  }
  const open = await listOpenInvoices();
  if (open.length === 0) return "✅ Não tem nenhuma fatura de cartão em aberto.";

  const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const words = new Set(norm(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !["fatura", "paguei", "cartao", "transferi", "quitei", "mandei", "para", "pro", "pra", "dia"].includes(w)));
  const otherCards = [...new Set(open.map((i) => i.card).filter(Boolean))];
  let card = "";
  // "C6" = o cartão do dono (a fatura do C6 também é paga ao irmão, então
  // "fatura do Bruno" sozinho apontaria para o cartão "Santander do Bruno").
  for (const c of /\bc6\b/.test(norm(text)) ? [] : otherCards) {
    const sample = await prisma.financeEntry.findMany({ where: { card: c }, select: { description: true }, take: 20 });
    const vocab = new Set(norm(`${c} ${sample.map((x) => x.description).join(" ")}`).split(/[^a-z0-9]+/));
    if ([...words].some((w) => vocab.has(w))) card = c;
  }
  const target = open.find((i) => i.card === card);
  if (!target) return `🤔 Não achei fatura em aberto de ${invoiceLabel(card)}.`;
  // Valor informado ("3880,57") tem que bater com a fatura (tolerância de R$ 1).
  // Só valor de verdade: "3880,57", "3.880,57" ou 3+ dígitos — nunca "s25" nem "dia 10".
  const said = text.match(/(?<![\w.,])(\d{1,3}(?:\.\d{3})*,\d{2}|\d{3,}(?:[.,]\d{2})?)(?![\w])/);
  if (said) {
    const value = Number(said[1].replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
    if (value >= 10 && Math.abs(value - target.total) > 1) {
      return `🤔 A fatura de ${invoiceLabel(card)} (vence ${target.dueDate.slice(8, 10)}/${target.dueDate.slice(5, 7)}) dá ${brl(target.total)}, e você falou ${brl(value)}. Não dei baixa. Confira e mande de novo.`;
    }
  }

  const { ids, total } = await payInvoice(card, target.dueDate);
  lastInvoicePayment = { ids, at: Date.now() };
  lastSaved = null;
  const others = open.filter((i) => i !== target);
  const due = `${target.dueDate.slice(8, 10)}/${target.dueDate.slice(5, 7)}`;
  return [
    `✅ Fatura paga: *${invoiceLabel(card)}* de ${due}`,
    `💳 ${ids.length} compras marcadas como pagas · ${brl(total)}`,
    others.length ? `\nAinda em aberto:\n${others.slice(0, 4).map((i) => `• ${invoiceLabel(i.card)} — ${brl(i.total)} (vence ${i.dueDate.slice(8, 10)}/${i.dueDate.slice(5, 7)})`).join("\n")}` : "",
    `↩️ Foi engano? Responda *desfazer*.`,
  ].filter(Boolean).join("\n");
}

/** "desfazer" e "na verdade foi 250". Devolve a resposta, ou null se não for o caso. */
async function applyUndoOrEdit(text: string): Promise<string | null> {
  const t = text.trim();
  const isUndo = UNDO_RE.test(t);
  const edit = isUndo ? null : t.match(EDIT_AMOUNT_RE);
  if (!isUndo && !edit) return null;

  // "desfazer" logo depois de pagar uma fatura: volta as compras para "a pagar".
  if (isUndo && lastInvoicePayment && Date.now() - lastInvoicePayment.at < 60 * 60 * 1000) {
    const { ids } = lastInvoicePayment;
    lastInvoicePayment = null;
    await prisma.financeEntry.updateMany({ where: { id: { in: ids } }, data: { status: "pending" } });
    return `↩️ Pronto, a fatura voltou para "a pagar" (${ids.length} compras).`;
  }

  const entries = await lastSavedEntries();
  if (entries.length === 0) {
    return "🤔 Não achei um lançamento recente feito por mensagem para corrigir. Se foi outro, corrija pelo painel.";
  }
  const first = entries[0];
  const label = first.description.replace(/\s*-?\s*Parcela \d+\/\d+.*$/, "").trim() || first.category;

  if (isUndo) {
    await prisma.financeEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
    lastSaved = null;
    return entries.length > 1
      ? `🗑️ Lançamento removido: ${label} · ${entries.length} parcelas de ${brl(first.amount)}`
      : `🗑️ Lançamento removido: ${label} · ${brl(first.amount)} · ${formatFullDate(first.purchaseDate ?? first.date)}`;
  }

  const amount = parseBrNumber(edit![edit!.length - 2]);
  if (!(amount > 0)) return null;
  await prisma.financeEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { amount } });
  if (entries.length > 1) return `✏️ Lançamento atualizado!\n📝 ${label}\n💰 ${entries.length} parcelas de ${brl(amount)}`;
  return `${entryCard({ ...first, amount }, "✏️ Lançamento atualizado!")}\n\n${UNDO_HINT}`;
}

/** Valor respondido depois de "Quanto foi?": devolve a frase original completada. */
function takeAmountReply(text: string): string | null {
  if (!pendingAmount) return null;
  const pending = pendingAmount;
  if (Date.now() - pending.at > 30 * 60 * 1000) {
    pendingAmount = null;
    return null;
  }
  const m = text.trim().match(AMOUNT_ONLY_RE);
  if (!m) return null;
  pendingAmount = null;
  return `${pending.text} — valor: R$ ${m[3]}`;
}

// Fatura em PDF com senha esperando o dono mandar a senha. Fica só na memória
// (some num reinício/deploy): nem o arquivo nem a senha vão para o banco ou log.
let pendingPdf: { base64: string; at: number } | null = null;
const PDF_PASSWORD_WINDOW_MS = 30 * 60 * 1000;

export async function askPdfPassword(config: AgentConfig, base64: string): Promise<void> {
  pendingPdf = { base64, at: Date.now() };
  await notifyOwner(config, "🔒 Essa fatura veio com senha. Me manda *só a senha* do PDF que eu abro e leio.\nSe não quiser mais, responda *cancelar*.");
}

/**
 * Próxima mensagem depois de um PDF com senha: tenta abrir com ela. Frase com
 * espaço não é senha — segue o fluxo normal (e o PDF continua esperando).
 * Devolve true se a mensagem foi tratada aqui.
 */
async function applyPdfPassword(text: string, config: AgentConfig): Promise<boolean> {
  if (!pendingPdf) return false;
  if (Date.now() - pendingPdf.at > PDF_PASSWORD_WINDOW_MS) {
    pendingPdf = null;
    return false;
  }
  const password = text.trim();
  if (/^cancela/i.test(password)) {
    pendingPdf = null;
    await notifyOwner(config, "👍 Ok, deixei essa fatura de lado.");
    return true;
  }
  if (!password || /\s/.test(password) || password.length > 40) return false;

  const { base64 } = pendingPdf;
  let pdfText: string;
  try {
    pdfText = await extractPdfText(base64, password);
  } catch (err) {
    if (pdfPasswordError(err) === "wrong") {
      await notifyOwner(config, "❌ Essa senha não abriu o PDF. Confere e manda de novo, ou responda *cancelar*.");
      return true;
    }
    pendingPdf = null;
    console.error("[pdf] falha ao abrir PDF com senha", err instanceof Error ? err.message : err);
    await notifyOwner(config, "⚠️ Não consegui abrir esse PDF. Manda um print de cada página da fatura que eu leio por imagem.");
    return true;
  }
  pendingPdf = null;
  if (!pdfText) {
    await notifyOwner(config, "⚠️ Abri o PDF, mas ele não tem texto (é imagem escaneada). Manda um print de cada página em vez do arquivo.");
    return true;
  }
  await notifyOwner(config, "🔓 Abri! Lendo a fatura, já te mando o resultado…");
  await handleStatementDocument(pdfText);
  return true;
}

// Gasto alto (≥ R$ 500 no total) digitado: espera "sim" antes de gravar —
// protege de erro de digitação ("2500" em vez de "250").
const HIGH_VALUE = 500;
let pendingHighValue: { text: string; at: number } | null = null;
let confirmedHighValueText: string | null = null;

export async function handleSelfMessage(joinedText: string, _meta: SelfMessageMeta): Promise<void> {
  return withReason(`mensagem: "${joinedText.trim().slice(0, 120)}"`, () => handleSelfMessageInner(joinedText, _meta));
}
async function handleSelfMessageInner(joinedText: string, _meta: SelfMessageMeta): Promise<void> {
  await restoreFlowStates();
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  // "sim"/"não" para a correção ou a divisão pedida respondendo a uma mensagem antiga.
  for (const kind of ["edit", "split"] as const) {
    const p = kind === "edit" ? pendingQuotedEdit : pendingSplit;
    if (!p || Date.now() - p.at > 30 * 60 * 1000) continue;
    const t = joinedText.trim();
    if (CONFIRM_YES_RE.test(t)) {
      if (kind === "edit") pendingQuotedEdit = null; else pendingSplit = null;
      await notifyOwner(config, kind === "edit" ? await applyQuotedEdit(p.entryId, (p as NonNullable<typeof pendingQuotedEdit>).change) : await applySplit(p.entryId, (p as NonNullable<typeof pendingSplit>).parts));
      return;
    }
    if (CONFIRM_NO_RE.test(t)) {
      if (kind === "edit") pendingQuotedEdit = null; else pendingSplit = null;
      await notifyOwner(config, "👍 Deixei como estava.");
      return;
    }
  }
  // Respondeu (citou) uma mensagem antiga: corrige aquele lançamento.
  const quotedReply = await applyQuotedReply(joinedText, _meta.quoted);
  if (quotedReply) {
    await notifyOwner(config, quotedReply);
    return;
  }
  // Vários pedidos numa mensagem: um por um (sem nada esperando resposta).
  if (!pendingHighValue && !pendingImageDraft && !pendingInvoiceDraft && !pendingAmount && !pendingStatement && !pendingCommitment) {
    const pedidos = splitRequests(joinedText);
    if (pedidos.length) {
      await notifyOwner(config, `📦 Entendi ${pedidos.length} pedidos — vou fazer um por um:\n${pedidos.map((p, i) => `${i + 1}. ${p}`).join("\n")}`);
      for (const p of pedidos) {
        try {
          await handleSelfMessageInner(p, _meta.quoted ? { messageTimestamp: _meta.messageTimestamp } : _meta);
        } catch (e) {
          console.error("[pedidos] falhou:", p, e);
          await notifyOwner(config, `⚠️ Não consegui fazer "${p}". Mande esse de novo sozinho.`);
        }
      }
      return;
    }
  }
  // "100 no VR e 80 no cartão" logo depois de uma nota (até 1 h): divide a nota.
  if (lastNotaEntry && Date.now() - lastNotaEntry.at < 60 * 60 * 1000) {
    const nota = await prisma.financeEntry.findUnique({ where: { id: lastNotaEntry.id } });
    const split = nota ? parseSplit(joinedText, nota.amount) : null;
    if (nota && split) {
      if ("erro" in split) await notifyOwner(config, `✂️ ${split.erro}`);
      else {
        lastNotaEntry = null;
        await notifyOwner(config, await applySplit(nota.id, split));
      }
      return;
    }
  }

  // Resposta com o valor que faltava ("25") completa a frase anterior.
  // (Com um print ou nota esperando resposta, o número é para eles.)
  if (!pendingImageDraft && !pendingInvoiceDraft) joinedText = takeAmountReply(joinedText) ?? joinedText;

  // "sim"/"não" para o gasto alto que estava esperando confirmação.
  if (pendingHighValue) {
    const pending = pendingHighValue;
    pendingHighValue = null;
    if (Date.now() - pending.at < 30 * 60 * 1000) {
      if (CONFIRM_YES_RE.test(joinedText.trim())) {
        joinedText = pending.text;
        confirmedHighValueText = pending.text;
      } else if (CONFIRM_NO_RE.test(joinedText.trim())) {
        await notifyOwner(config, "👍 Ok, não lancei.");
        return;
      }
    }
  }

  // Senha de PDF não passa pela IA nem é gravada no histórico.
  if (await applyPdfPassword(joinedText, config)) return;
  if (await applyStatementChoice(joinedText, config)) return;

  // Comandos do trabalho ("chamado 1234567 resolvido"): regra fixa, sem IA e
  // fora do histórico da conversa (dado do Tribunal não passa pela IA).
  const { attachPendingWorkChat } = await import("./work-phone");
  const { applyAlexaCommand } = await import("./alexa");
  const { applyMcpCommand } = await import("./mcp-tools");
  // Link do YouTube: o Gemini assiste e manda o resumo (ou responde a pergunta junto).
  const ytReply = await applyYoutube(joinedText, (t) => notifyOwner(config, t));
  if (ytReply) {
    await notifyOwner(config, ytReply);
    return;
  }
  const workReply = (await attachPendingWorkChat(joinedText)) ?? (await applyWorkCommand(joinedText)) ?? (await applyAlertRuleCommand(joinedText)) ?? (await applyMcpCommand(joinedText)) ?? (await applyScooterCommand(joinedText)) ?? (await applyAlexaCommand(joinedText)) ?? (await applyCreditCommand(joinedText)) ?? (await applySpentDayCommand(joinedText)) ?? (await applyAttentionCommand(joinedText)) ?? (await applyExplainLimitCommand(joinedText)) ?? (await applyHistoryCommand(joinedText)) ?? (await (await import("./health")).applyHealthCommand(joinedText, config)) ?? (await applyAiLabCommand(joinedText, (t) => notifyOwner(config, t))) ?? (await applyExtrasCommand(joinedText)) ?? (await applyUsageCommand(joinedText)) ?? (await applyOutlookCommand(joinedText)) ?? (await applyAirconCommand(joinedText)) ?? (await applySaidasCommand(joinedText));
  if (workReply) {
    await notifyOwner(config, workReply);
    return;
  }

  const providerOpts = getProviderOpts(config);

  let conv = await prisma.conversation.findFirst({
    where: { phone: config.ownerPhone, source: "self" },
    include: { messages: { orderBy: { createdAt: "desc" }, take: config.historyLimit } },
  });

  const paymentReply =
    (await applyCommitmentCommands(joinedText, config)) ??
    (await applyImageDraftReply(joinedText, config)) ??
    (await applyInvoiceDraftReply(joinedText, config)) ??
    (await applyUndoOrEdit(joinedText)) ??
    (await applyInvoicePayment(joinedText)) ??
    (await applySavingsReply(joinedText, conv?.messages)) ??
    (await applySalaryReply(joinedText, conv?.messages)) ??
    (await applyPaymentReply(joinedText, config));
  if (paymentReply) {
    if (!conv) {
      conv = await prisma.conversation.create({
        data: { phone: config.ownerPhone, source: "self" },
        include: { messages: { orderBy: { createdAt: "desc" }, take: config.historyLimit } },
      });
    }
    await prisma.message.create({ data: { conversationId: conv.id, role: "user", content: joinedText } });
    await prisma.message.create({ data: { conversationId: conv.id, role: "assistant", content: paymentReply } });
    await notifyOwner(config, paymentReply);
    return;
  }

  const recentContext = conv?.messages
    .slice()
    .reverse()
    .map((m) => `${m.role === "user" ? "Dono" : "Secretária"}: ${m.content}`)
    .join("\n");

  const route = await routePersonalMessage(joinedText, config.ownerName, providerOpts, recentContext, config.systemPrompt, config.creditCardDueDay, config.creditCardBestDay);

  if (!conv) {
    conv = await prisma.conversation.create({
      data: { phone: config.ownerPhone, source: "self" },
      include: { messages: { orderBy: { createdAt: "desc" }, take: config.historyLimit } },
    });
  }
  await prisma.message.create({ data: { conversationId: conv.id, role: "user", content: joinedText } });

  let response = route.confirmation;
  let categorySummary: Awaited<ReturnType<typeof buildCategorySummary>> | null = null;

  switch (route.type) {
    case "agenda_add":
      await prisma.agendaItem.create({
        data: {
          source: "self",
          category: route.category,
          title: route.title,
          description: route.description,
          // Data/hora sem fuso vinda da IA é horário de Brasília (o servidor roda em UTC).
          dueDate: route.dueDate
            ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(route.dueDate) || !route.dueDate.includes("T") ? route.dueDate : `${route.dueDate}-03:00`)
            : null,
          rawMessage: joinedText,
        },
      });
      break;
    case "finance": {
      // Regra de categoria aprovada por ele vale antes da escolha da IA.
      if (route.financeType === "expense") {
        const regra = await categoryRuleFor(route.description || "", joinedText).catch(() => null);
        if (regra) Object.assign(route, { category: regra.category, subcategory: regra.subcategory });
      }
      // Sem valor ("gastei com uber"): não grava, pergunta e espera a resposta.
      if (!(route.amount > 0)) {
        if ((imageReading || pendingImageDraft) && Date.now() - imageArrivedAt < IMAGE_NOTE_WINDOW_MS && route.financeType !== "income") {
          imageNote = { description: route.description || "", category: route.category || "", subcategory: route.subcategory || "", at: Date.now() };
          // O texto é do print que acabou de chegar: o último da fila, se houver fila.
          const alvo = imageDraftQueue.length ? imageDraftQueue[imageDraftQueue.length - 1] : pendingImageDraft;
          if (alvo) {
            // O print já foi lido: ajusta o cartão e pergunta de novo.
            applyNoteToReading(alvo.reading);
            alvo.at = Date.now();
            // Ele descreveu um gasto: não é mais a pergunta "é o pagamento da fatura?".
            alvo.invoice = undefined;
            response =
              alvo === pendingImageDraft
                ? `📝 Juntei com o print:\n\n${entryCard(imageDraftEntry(alvo.reading, config), "🧐 Lançar assim?")}\n\nResponda *sim* para salvar ou *não* para descartar.`
                : `📝 Juntei com o print de ${brl(alvo.reading.amount)}, que está na fila: ele aparece depois do *sim*/*não* do de ${brl(pendingImageDraft!.reading.amount)}.`;
          } else {
            response = "📸 Beleza, junto essa descrição com o print que estou lendo. Já te mostro.";
          }
          break;
        }
        pendingAmount = { text: joinedText, at: Date.now() };
        response = `💬 Quanto foi ${route.description ? `*${route.description}*` : "esse gasto"}? Responda só o valor (ex: 25,90).`;
        break;
      }
      // Gasto alto: confere antes de gravar (paguei/recebi = baixa de conta
      // prevista, não precisa). Parcelado conta o total.
      const totalValue = route.amount * (route.installments || 1);
      if (
        route.financeType === "expense" &&
        totalValue >= HIGH_VALUE &&
        confirmedHighValueText !== joinedText &&
        !/\b(paguei|quitei|recebi|caiu|entrou)\b/i.test(joinedText)
      ) {
        pendingHighValue = { text: joinedText, at: Date.now() };
        // O print que esperava volta para a frente da fila (não some).
        if (pendingImageDraft) imageDraftQueue.unshift(pendingImageDraft);
        pendingImageDraft = null;
        const how = route.installments ? `${route.installments}× de ${brl(route.amount)} (total ${brl(totalValue)})` : brl(route.amount);
        response = `🧐 *Confere antes de eu lançar:*\n📝 ${route.description}\n💰 ${how}\n📂 ${route.category}${route.subcategory ? ` › ${route.subcategory}` : ""}\n\nResponda *sim* para lançar ou *não* para cancelar.`;
        break;
      }
      confirmedHighValueText = null;

      // Gasto sem meio de pagamento dito na mensagem = cartão (o normal dele);
      // a confirmação pergunta se foi outro meio (ver applyPaymentReply).
      const askPayment = route.financeType === "expense" && !route.installments && !PAYMENT_STATED_RE.test(joinedText);
      if (askPayment) route.paymentMethod = "cartão";

      // Compra no cartão: a data do lançamento é o vencimento da fatura certa
      // (regra fixa em código, não fica a critério da IA); a data real da
      // compra vai em purchaseDate. Exceção: se ele disse explicitamente a
      // fatura ("pagamento para dia 10/11"), vale o que ele disse — o
      // fechamento às vezes muda (ex: feriado/eleição).
      const isCardExpense = route.paymentMethod === "cartão" && route.financeType === "expense";
      const cardPurchaseDate = route.purchaseDate ? parseLocalDate(route.purchaseDate) : todayBRT();
      // Cartão de outra pessoa citado ("no santander do bruno"): vai para ele, com o vencimento dele.
      const cardName = isCardExpense ? cardInText(config, joinedText) : "";
      if (isCardExpense) {
        const days = billDaysFor(config, cardName);
        route.purchaseDate = cardPurchaseDate.toISOString();
        route.date = (route.billDate && BILL_STATED_RE.test(joinedText)
          ? parseLocalDate(route.billDate)
          : creditCardBillDate(cardPurchaseDate, days.due, days.best)
        ).toISOString();
        route.status = "pending";
      }

      if (route.installments) {
        // Compra parcelada relatada por mensagem (não veio de extrato) — usa
        // o mesmo formato "Parcela X/Y (compra em DD/MM)" pra reaproveitar a
        // projeção/dedupe de saveStatementEntries em vez de duplicar a lógica.
        const today = cardPurchaseDate;
        const compraEm = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}`;
        lastSaved = { since: new Date() };
        pendingInvoiceDraft = null;
        lastInvoicePayment = null;
        await saveStatementEntries(
          config,
          [
            {
              date: route.date || today.toISOString(),
              purchaseDate: route.purchaseDate || today.toISOString(),
              description: `${route.description} - Parcela 1/${route.installments} (compra em ${compraEm})`,
              amount: route.amount,
              type: route.financeType,
              category: route.category,
              subcategory: route.subcategory,
              paymentMethod: route.paymentMethod,
              status: route.status,
              card: cardName,
            },
          ],
          "a mensagem"
        );
        response = "";
      } else {
        // "Paguei o aluguel" / "recebi o salário" dá baixa numa conta que já
        // estava prevista, em vez de lançar outra. Só quando a mensagem fala
        // em pagar/receber, só contas fora do cartão (compra no cartão nunca é
        // "baixa"), vencendo agora (até 45 dias atrás / 10 dias à frente), e
        // com o mesmo valor ou a mesma categoria+subcategoria. Antes bastava
        // valor OU categoria iguais — um almoço no pix "pagava" um almoço
        // antigo do cartão e o gasto novo nunca era lançado.
        let existingPending = null;
        const settlesBill = route.status === "paid" && /\b(paguei|quitei|dei baixa|baixa|recebi|caiu|entrou)\b/i.test(joinedText);
        if (settlesBill) {
          const today = todayBRT();
          existingPending = await prisma.financeEntry.findFirst({
            where: {
              type: route.financeType,
              status: "pending",
              paymentMethod: { not: "cartão" },
              // "recebi o salário" não pode dar baixa no crédito do VR (também é categoria Salário).
              ...(route.financeType === "income" && !/\b(vr|vale|ticket)\b/i.test(joinedText) ? { NOT: { account: { in: ["VR", "Vale antigo"] } } } : {}),
              date: { gte: new Date(today.getTime() - 45 * 86400000), lte: new Date(today.getTime() + 10 * 86400000) },
              OR: [
                { amount: { gte: route.amount - 0.01, lte: route.amount + 0.01 } },
                { category: route.category, subcategory: route.subcategory },
                // Entrada: basta a categoria (ex: salário previsto com subcategoria diferente).
                ...(route.financeType === "income" ? [{ category: route.category }] : []),
              ],
            },
            orderBy: { date: "asc" },
          });
        }

        if (existingPending) {
          lastSaved = null; // baixa não cria lançamento: nada para desfazer

          // Vale o valor que ele disse (ex: salário veio menor que o previsto).
          const newAmount = route.amount > 0 ? route.amount : existingPending.amount;
          await prisma.financeEntry.update({
            where: { id: existingPending.id },
            data: {
              status: "paid",
              amount: newAmount,
              date: route.date ? parseLocalDate(route.date) : existingPending.date,
            }
          });
          response = `✅ Baixa confirmada na conta pendente:\n${existingPending.description || existingPending.category} (${brl(newAmount)})`;
          if (Math.abs(newAmount - existingPending.amount) > 0.01) {
            response += `\n(o previsto era ${brl(existingPending.amount)} — atualizei para o valor que você informou)`;
          }
          if (route.financeType === "income" && /sal[aá]rio/i.test(existingPending.category)) {
            response += await salaryCheckup(newAmount, existingPending.amount, existingPending.date);
          }
        } else {
          // Humor do dia do GASTO ("ontem gastei…" usa o diário de ontem).
          const spentOn = route.purchaseDate ? parseLocalDate(route.purchaseDate) : new Date();
          let finalMood = route.mood || "neutro";
          if (finalMood === "neutro") finalMood = await diaryMoodOn(spentOn);

          lastSaved = { since: new Date() };
          pendingInvoiceDraft = null;
          lastInvoicePayment = null;
          const created = await prisma.financeEntry.create({
            data: {
              type: route.financeType,
              amount: route.amount,
              category: route.category,
              subcategory: route.subcategory,
              description: route.description,
              date: route.date ? parseLocalDate(route.date) : new Date(),
              purchaseDate: route.purchaseDate ? parseLocalDate(route.purchaseDate) : new Date(),
              paymentMethod: route.paymentMethod,
              account: route.account,
              status: route.status,
              card: cardName,
              mood: finalMood,
              source: "whatsapp",
            },
          });

          // Resposta montada pelo código (antes era o texto livre da IA).
          response = `${entryCard(created, created.type === "income" ? "✅ Receita salva!" : "✅ Lançamento salvo!")}\n\n${
            askPayment ? `${PAYMENT_QUESTION}\nOutro dia de compra? Responda a data (ex: 15/08).\n` : ""
          }${UNDO_HINT}`;

          if (route.financeType === "income" && /sal[aá]rio/i.test(created.category)) {
            response += await salaryCheckup(created.amount, created.amount, created.date);
          }

          if (finalMood === "neutro" && route.financeType === "expense" && route.amount >= 100) {
            response += askMoodFor(created.id, spentOn, "Percebi esse gasto mais elevado.");
          }
        }

        // 🎯 Teto da categoria (aviso a partir de 70%) e previsão do mês: o
        // dono quer ser avisado ANTES de dar ruim, não depois.
        if (route.financeType === "expense" && response) {
          const mDate = route.date ? parseLocalDate(route.date) : todayBRT();
          const { items } = await budgetStatus(mDate.getFullYear(), mDate.getMonth());
          const b = items.find((x) => x.category === route.category);
          if (b) {
            const percent = (b.spent / b.limit) * 100;
            if (percent >= 100) {
              response += `\n\n🔴 *Teto de ${b.category} estourado:* ${brl(b.spent)} de ${brl(b.limit)} (passou ${brl(b.spent - b.limit)}).`;
            } else if (percent >= 70) {
              response += `\n\n🟡 *Atenção:* ${percent.toFixed(0)}% do teto de ${b.category} (${brl(b.spent)} de ${brl(b.limit)}). Restam ${brl(b.limit - b.spent)} até o fim do mês.`;
            }
            const isSensitive = ["delivery", "ifood", "lanche", "bebida", "cerveja", "besteira"]
              .some((kw) => route.category.toLowerCase().includes(kw) || route.subcategory.toLowerCase().includes(kw) || route.description.toLowerCase().includes(kw));
            if (percent >= 70 && isSensitive && route.amount >= 30) {
              try {
                const { content } = await generateResponse(
                  [{ role: "user", content: `O Renato gastou ${brl(route.amount)} em ${route.category} › ${route.subcategory} (${route.description}). No mês já foi ${brl(b.spent)} de um teto de ${brl(b.limit)} (${percent.toFixed(0)}%). Dê um toque amigável e MUITO CURTO (1 frase) para ele segurar esse tipo de gasto. Sem sermão.` }],
                  "Você é uma assistente financeira.",
                  0.7,
                  80,
                  providerOpts
                );
                response += `\n💬 ${content.trim()}`;
              } catch {
                // sem dica, o número acima já avisa
              }
            }
          }
          response += await monthForecastLine(mDate.getFullYear(), mDate.getMonth());

          // Comprou algo da lista de desejos? Tira da lista.
          const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const said = norm(`${joinedText} ${route.description}`);
          const wishes = await prisma.wishItem.findMany({ where: { status: "wish" } });
          const bought = wishes.find((w) => norm(w.name).split(/[^a-z0-9]+/).filter((x) => x.length >= 4).some((x) => said.includes(x)));
          if (bought) {
            await prisma.wishItem.update({ where: { id: bought.id }, data: { status: "bought" } });
            response += `\n🛍️ Tirei *${bought.name}* da lista de desejos.`;
          }
        }
      }
      break;
    }
    case "finance_update_date": {
      const lastEntry = await prisma.financeEntry.findFirst({
        where: { source: "whatsapp" },
        orderBy: { createdAt: "desc" },
      });
      if (lastEntry) {
        const newPDate = parseLocalDate(route.newPurchaseDate);
        // Compra avulsa no cartão: mudar a data da compra pode mudar a fatura.
        // Parcelas ficam de fora (cada uma já tem o vencimento do seu mês).
        const isSingleCardExpense = lastEntry.paymentMethod === "cartão" && lastEntry.type === "expense" && !/Parcela \d+\/\d+/.test(lastEntry.description);
        await prisma.financeEntry.update({
          where: { id: lastEntry.id },
          data: {
            purchaseDate: newPDate,
            ...(isSingleCardExpense && { date: creditCardBillDate(newPDate, config.creditCardDueDay || 10, config.creditCardBestDay || 5) }),
          },
        });
        const formattedDate = newPDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
        response = `📅 Perfeito! Atualizei a data de compra de "${lastEntry.description || lastEntry.category}" (${brl(lastEntry.amount)}) para **${formattedDate}**.`;
      } else {
        response = "❌ Não encontrei nenhum lançamento financeiro recente para atualizar a data.";
      }
      break;
    }
    case "savings_add":
      const goals = await prisma.savingsGoal.findMany();
      if (goals.length === 0) {
        response = `❌ Nenhuma meta de economia cadastrada para adicionar ${brl(route.amount)}. Cadastre primeiro pelo painel!`;
      } else {
        const term = route.goalName.toLowerCase();
        let targetGoal = goals.find((g) => g.name.toLowerCase() === term) 
                      || goals.find((g) => g.name.toLowerCase().includes(term));
        
        if (!targetGoal) {
          response = `❌ Não encontrei a meta "${route.goalName}". As metas que você tem são: ${goals.map((g) => g.name).join(", ")}.`;
        } else {
          // "Tirei/usei/saquei X da reserva" = retirada, mesmo se a IA mandar positivo;
          // "guarda/coloca/deposita X" = depósito, mesmo se a IA mandar negativo
          // (teste de 22/10: "guarda 100 na reserva" voltou com -100 e virou retirada).
          const saida = /\b(tira|tirei|retira|retirei|saca|saquei|usa|usei|pega|peguei)\b/i.test(joinedText);
          const entrada = /\b(guarda|guardei|guardar|coloca|coloquei|deposita|depositei|p[oõ]e|pus|junta|juntei)\b/i.test(joinedText);
          const isWithdraw = saida || (route.amount < 0 && !entrada);
          const delta = isWithdraw ? -Math.abs(route.amount) : Math.abs(route.amount);
          const newAmount = Math.max(0, targetGoal.currentAmount + delta);
          await prisma.savingsGoal.update({
            where: { id: targetGoal.id },
            data: { currentAmount: newAmount }
          });
          response = isWithdraw
            ? `💸 Retirei ${brl(Math.abs(delta))} de "${targetGoal.name}".\n💰 Saldo atual da meta: ${brl(newAmount)} de ${brl(targetGoal.targetAmount)}`
            : `✅ Guardado ${brl(delta)} em "${targetGoal.name}"!\n💰 Saldo atual da meta: ${brl(newAmount)} de ${brl(targetGoal.targetAmount)}${newAmount >= targetGoal.targetAmount ? "\n🏆 *Meta conquistada!*" : ""}`;
        }
      }
      break;
    case "finance_simulation":
      response = await simulateFinance(route, config);
      break;
    case "goal_create": {
      if (!(route.amount > 0)) {
        response = "🤔 Qual o valor da meta? Ex: \"quero juntar 3000 pra viagem até julho\".";
        break;
      }
      const goal = await prisma.savingsGoal.create({
        data: { name: route.goalName.charAt(0).toUpperCase() + route.goalName.slice(1), targetAmount: route.amount, deadline: route.deadline ? parseLocalDate(route.deadline) : null },
      });
      const need = goalMonthlyNeed(goal);
      response = `🎯 Meta criada: *${goal.name}* — ${brl(goal.targetAmount)}${need ? `\n💰 Guardar ${brl(need.perMonth)}/mês até ${need.until}` : "\nSem prazo: me diga até quando para eu calcular quanto guardar por mês."}${await goalsViabilityLine([goal])}\nPara guardar: "guarda 200 na ${goal.name.toLowerCase()}".`;
      break;
    }
    case "wish_add": {
      const wish = await prisma.wishItem.create({
        data: {
          name: route.simDescription ? route.simDescription.charAt(0).toUpperCase() + route.simDescription.slice(1) : "Desejo",
          amount: route.simPurchaseAmount || 0,
          installments: route.simPaymentMethod === "cartão" ? Math.max(1, Math.round(route.simInstallments || 1)) : 1,
          paymentMethod: route.simPaymentMethod,
          category: route.simCategory || "Compras",
        },
      });
      const v = await checkWish(wish);
      response = `🛍️ Anotei na lista de desejos: *${wishLabel(wish)}*\n${levelIcon[v.level]} ${v.text.charAt(0).toUpperCase() + v.text.slice(1)}.\n${v.level === "green" ? "Se for comprar, me conta que eu lanço." : "Quando couber, eu te aviso. 😉"}`;
      break;
    }
    case "finance_question":
      response = await answerFinanceQuestion(route.question, providerOpts);
      break;
    case "chat":
      response = await answerChat(joinedText, recentContext, config.ownerName, providerOpts);
      break;
    case "diary": {
      // Só vale como resposta logo depois da pergunta e se ele não falou de "hoje".
      const ask = pendingMoodAsk && Date.now() - pendingMoodAsk.at < 10 * 60 * 1000 && !/\bhoje\b/i.test(joinedText) ? pendingMoodAsk : null;
      pendingMoodAsk = null;
      await prisma.diaryEntry.create({
        data: {
          content: route.content,
          mood: route.mood,
          source: "whatsapp",
          // Resposta à pergunta do humor da nota: dia da compra, 15:00 BRT.
          ...(ask ? { date: new Date(ask.day.getTime() + 15 * 3600_000) } : {}),
        },
      });
      if (ask && route.mood && route.mood !== "neutro") {
        await prisma.financeEntry.updateMany({ where: { id: ask.entryId, mood: "neutro" }, data: { mood: route.mood } });
      }
      if (!ask && route.mood && route.mood !== "neutro") {
        // Diário comum ("hoje foi puxado"): marca os gastos FEITOS hoje
        // (purchaseDate; o `date` do cartão é o vencimento da fatura).
        const { start: todayStart, end: todayEnd } = brtDayRange(new Date());
        await prisma.financeEntry.updateMany({
          where: {
            purchaseDate: { gte: todayStart, lte: todayEnd },
            mood: "neutro",
            source: "whatsapp"
          },
          data: { mood: route.mood }
        });
      }

      // Passo 3: Remanejamento Automático por Contexto
      const contextPrompt = `Analise este relato de diário: "${route.content}".
Verifique se o usuário relatou algum gasto imprevisto, emergência médica, conserto de carro, roubo, ou quebra de algo que custará dinheiro extra.
Responda APENAS com um JSON válido estritamente neste formato, sem markdown ou texto extra: {"hasUnexpectedExpense": boolean, "suggestedCategoryToReduce": string | null, "reason": string | null}
Se houver imprevisto, defina hasUnexpectedExpense: true, escolha uma categoria do orçamento não essencial para reduzir (ex: "Lazer" ou "Alimentação") e preencha reason com um mini resumo de 4 palavras (ex: "conserto do carro").`;
      try {
        const { content } = await generateResponse([{ role: "user", content: contextPrompt }], "Você é um classificador JSON.", 0.1, 150, providerOpts);
        const cleanJson = content.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanJson);
        if (parsed.hasUnexpectedExpense && parsed.suggestedCategoryToReduce) {
          response += `\n\n💡 *Alerta de Imprevisto:* Poxa, vi que teve esse problema com ${parsed.reason.toLowerCase()}. Quer que eu proponha um remanejamento do seu limite de ${parsed.suggestedCategoryToReduce} para cobrir esse buraco e você não estourar o mês?`;
        }
      } catch (e) {
        console.error("Falha ao classificar imprevisto no diário", e);
      }
      break;
    }
    case "agenda_query":
      if (route.queryIntent === "chart") {
        // Pedido só do gráfico: texto curto e a imagem logo depois.
        if (route.chartKind === "category") {
          categorySummary = await buildCategorySummary(route.queryCategory);
          response = categorySummary.text;
        } else {
          response = "📊 Já te mando o gráfico…";
        }
      } else if (route.queryIntent === "category_summary") {
        categorySummary = await buildCategorySummary(route.queryCategory);
        response = categorySummary.text;
      } else {
        response = await buildQueryResponse(route.queryIntent);
      }
      break;
  }

  await prisma.message.create({ data: { conversationId: conv.id, role: "assistant", content: response } });

  if (response) {
    await notifyOwner(config, response);
  }

  // Fechamento e diagnóstico vêm com o gráfico de gastos por categoria.
  if (route.type === "agenda_query" && (route.queryIntent === "month_closing" || route.queryIntent === "month_diagnosis")) {
    const today = todayBRT();
    const ref = route.queryIntent === "month_closing" ? new Date(today.getFullYear(), today.getMonth() - 1, 1) : today;
    await sendMonthChart(config, ref.getFullYear(), ref.getMonth());
  }
  if (route.type === "agenda_query" && route.queryIntent === "savings_summary") {
    await sendGoalsChart(config);
  }
  if (route.type === "agenda_query" && route.queryIntent === "budget_status") {
    await sendBudgetChart(config);
  }
  if (categorySummary) {
    await sendCategoryChart(config, categorySummary);
  }
  if (route.type === "agenda_query" && route.queryIntent === "chart") {
    const today = todayBRT();
    if (route.chartKind === "income_expense") await sendIncomeExpenseChart(config);
    else if (route.chartKind === "goals") await sendGoalsChart(config);
    else if (route.chartKind !== "category") await sendMonthChart(config, today.getFullYear(), today.getMonth());
  }
}

export async function saveStatementEntries(config: AgentConfig, entries: StatementEntry[], sourceLabel: string): Promise<{ touchedIds: string[] }> {
  if (entries.length === 0) {
    await notifyOwner(config, `⚠️ Recebi ${sourceLabel} mas não consegui identificar nenhuma transação.`);
    return { touchedIds: [] };
  }

  const { toInsert, duplicates, projected, matchedManual, adjusted, touchedIds } = await projectAndInsertFinanceEntries(entries, "whatsapp", config.creditCardDueDay);
  const adjustedText = adjusted.length
    ? `\n🔄 Troquei ${adjusted.length === 1 ? "a previsão" : `${adjusted.length} previsões`} pelo valor real da fatura:\n${adjusted
        .map((a) => `• ${a.description}: ${brl(a.from)} → ${brl(a.to)} (${a.to >= a.from ? "+" : "−"}${brl(Math.abs(a.to - a.from))})`)
        .join("\n")}`
    : "";

  if (toInsert.length === 0) {
    await notifyOwner(config, `⚠️ Recebi ${sourceLabel}, mas todas as transações já estavam lançadas (importadas antes ou anotadas por você).${adjustedText}`);
    return { touchedIds };
  }

  const real = toInsert.length - projected;
  const total = toInsert
    .filter((e) => !e.description.includes("(previsto)"))
    .reduce((s, e) => s + (e.type === "expense" ? e.amount : -e.amount), 0);

  let response = `✅ Importei ${real} lançamento(s) do extrato.\n💰 Total em despesas: ${brl(total)}`;
  if (projected > 0) response += `\n📅 +${projected} parcela(s) futura(s) projetada(s) nos próximos meses.`;
  if (duplicates > 0) response += `\n♻️ ${duplicates} já estavam lançadas (ignoradas pra não duplicar).`;
  if (matchedManual.length > 0) {
    const list = matchedManual.slice(0, 15).map((e) => `• ${e.description} — ${brl(e.amount)}`).join("\n");
    response += `\n✍️ ${matchedManual.length} você já tinha anotado — não dupliquei; atualizei com o nome e a data do cartão (sua categoria ficou):\n${list}${matchedManual.length > 15 ? "\n…" : ""}`;
  }
  response += adjustedText;
  response += await budgetAlertsAfterImport([...toInsert, ...matchedManual].filter((e) => !e.description.includes("(previsto)")));
  await notifyOwner(config, response);
  return { touchedIds };
}

/**
 * Processa um PDF de extrato: extrai todas as transações e lança de uma vez
 * no Financeiro. É um fluxo à parte de handleSelfMessage porque um extrato
 * vira MUITOS lançamentos, não uma classificação única.
 */
// Fatura com mais de um cartão esperando o dono escolher quais importar.
// Só na memória, como o PDF com senha.
type CardSection = import("./pdf").CardSection;
let pendingStatement: { text: string; sections: CardSection[]; total: number | null; at: number } | null = null;
const STATEMENT_CHOICE_WINDOW_MS = 30 * 60 * 1000;

export async function handleStatementDocument(statementText: string): Promise<void> {
  return withReason(`fatura em PDF`, () => handleStatementDocumentInner(statementText));
}
async function handleStatementDocumentInner(statementText: string): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  // Fatura com titular + adicionais: separa pelos cabeçalhos "Final XXXX - NOME".
  // Um cartão só importa direto; mais de um, pergunta quais importar.
  const sections = splitCardSections(statementText);
  if (sections.length === 1) {
    await importCardSections(config, statementText, sections, null);
    return;
  }
  if (sections.length > 1) {
    const totalMatch = statementText.match(/Valor da fatura:?\s*R\$\s*([\d.]+,\d{2})/i);
    const total = totalMatch ? Number(totalMatch[1].replace(/\./g, "").replace(",", ".")) : null;
    pendingStatement = { text: statementText, sections, total, at: Date.now() };
    const lines = sections.map((sec, i) =>
      `*${i + 1}* — ${sec.holder} (final ${sec.last4})${sec.subtotal !== null ? `: ${brl(sec.subtotal)}` : ""}${holderMatches(sec.holder, config.ownerName) ? " ← você" : ""}`
    );
    const example = sections.findIndex((sec) => holderMatches(sec.holder, config.ownerName)) + 1 || 1;
    await notifyOwner(
      config,
      `💳 Essa fatura tem ${sections.length} cartões:\n${lines.join("\n")}${total !== null ? `\nTotal da fatura (todos juntos): ${brl(total)}` : ""}\n\nQuais eu importo? Responda *${example}*, *1 e 2*, *tudo* ou o nome. Para desistir, *cancelar*.`
    );
    return;
  }

  // Sem cabeçalho de cartão: texto todo, com o filtro de titular no prompt.
  const entries = await parseStatementEntries(statementText, getProviderOpts(config), config.ownerName);
  await saveStatementEntries(config, entries, "o PDF");
}

/**
 * Importa os cartões escolhidos: cada um vai separado para a IA (fatura longa
 * não é cortada) e, no fim, confere com o subtotal impresso — ou com o valor
 * total da fatura, quando importou todos. Compras de cartão que não é do dono
 * ganham "· cartão final XXXX" na descrição.
 */
async function importCardSections(config: AgentConfig, statementText: string, chosen: CardSection[], total: number | null): Promise<void> {
  const providerOpts = getProviderOpts(config);
  const due = invoiceDueDate(statementText);
  const header = `${due ? `VENCIMENTO DESTA FATURA: ${isoDay(due.getFullYear(), due.getMonth(), due.getDate())}\n` : ""}${statementText.slice(0, 600)}`;
  const entries: StatementEntry[] = [];
  for (const sec of chosen) {
    // Cartão com muitas compras estoura o tamanho da resposta da IA: manda em
    // pedaços de ~20 compras, sempre cortando no início de uma compra.
    const parsed: StatementEntry[] = [];
    for (const piece of splitTransactions(sec.text, 1000)) {
      const text = `CABEÇALHO DA FATURA (só para saber o vencimento — NÃO extraia transações daqui):
${header}

TRANSAÇÕES DO CARTÃO FINAL ${sec.last4} (extraia todas estas). "Pagamento Fatura" é o pagamento da fatura anterior: ignore, não é receita.
${piece}`;
      // ownerName vazio: a escolha do cartão já foi feita aqui, o prompt não deve filtrar de novo.
      const got = await parseStatementEntries(text, providerOpts, "");
      parsed.push(...(due ? got.map((e) => applyInvoiceDates(e, due)) : got));
    }
    const mine = holderMatches(sec.holder, config.ownerName);
    entries.push(...(mine ? parsed : parsed.map((e) => ({ ...e, description: `${e.description} · cartão final ${sec.last4}`.slice(0, 200) }))));
  }
  console.log(`[statement:pdf] ${chosen.length} cartão(ões) importado(s), ${entries.length} transações`);
  const started = new Date();
  const { touchedIds } = await saveStatementEntries(config, entries, "o PDF");
  if (entries.length === 0) return;

  const read = entries.reduce((sum, e) => sum + (e.type === "expense" ? e.amount : -e.amount), 0);
  const expected = total ?? (chosen.every((sec) => sec.subtotal !== null) ? chosen.reduce((sum, sec) => sum + (sec.subtotal ?? 0), 0) : null);
  let check = `📄 Cartões lidos: ${chosen.map((sec) => `final ${sec.last4}`).join(", ")}.`;
  if (expected !== null) {
    const diff = Math.round((expected - read) * 100) / 100;
    check += Math.abs(diff) < 0.05
      ? `\n🧮 Conferi: ${brl(read)} = ${total !== null ? "total da fatura" : "subtotal da fatura"} ✅`
      : `\n🧮 Conferi: li ${brl(read)}, mas a fatura diz ${brl(expected)} (diferença ${brl(Math.abs(diff))}). Vale dar uma olhada no painel.`;
  }
  if (due) check += await cardBillAfterImport(due, started, touchedIds);
  await notifyOwner(config, check);
}

/**
 * Depois de importar a fatura: o valor real do cartão nesse vencimento (o que
 * o app vai cobrar) e o que ficou no app sem aparecer na fatura — previsão que
 * não veio, gasto anotado à mão com valor errado ou repetido. Não apaga nada.
 */
async function cardBillAfterImport(due: Date, started: Date, touchedIds: string[]): Promise<string> {
  const from = new Date(due.getTime() - 12 * 3600_000), to = new Date(due.getTime() + 36 * 3600_000);
  const bill = await prisma.financeEntry.findMany({
    where: { paymentMethod: "cartão", card: "", date: { gte: from, lt: to } },
    select: { id: true, type: true, amount: true, description: true, category: true, createdAt: true },
  });
  if (!bill.length) return "";
  const total = bill.reduce((acc, e) => acc + (e.type === "expense" ? e.amount : -e.amount), 0);
  const touched = new Set(touchedIds);
  // Ficou de fora: já existia antes desta importação e nenhuma linha da fatura casou com ele.
  const left = bill.filter((e) => e.createdAt < started && !touched.has(e.id) && !/Parcela \d+\/\d+|\(recorrente\)/.test(e.description) && e.category !== "Assinaturas");
  const dueTxt = `${String(due.getDate()).padStart(2, "0")}/${String(due.getMonth() + 1).padStart(2, "0")}`;
  let out = `\n💳 *Fatura de ${dueTxt} no app: ${brl(total)}* (valor real, já com o que eu troquei).`;
  if (left.length) {
    out += `\n🔎 ${left.length} lançamento(s) do app não apareceram na fatura — confira se são repetidos ou de outro mês:\n${left
      .slice(0, 10)
      .map((e) => `• ${e.description} — ${brl(e.amount)}`)
      .join("\n")}${left.length > 10 ? "\n…" : ""}`;
  }
  return out;
}

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/**
 * Vencimento da fatura ("Vencimento: 10 de Outubro"). Sem ano impresso, usa o
 * ano que deixa a data mais perto de hoje — a IA chutava (já saiu 2023).
 */
function invoiceDueDate(text: string): Date | null {
  const m = text.match(/Vencimento:?\s*(\d{1,2})\s+de\s+([A-Za-zçÇ]+)(?:\s+de\s+(\d{4}))?/i);
  if (!m) return null;
  const month = MONTHS_PT.indexOf(m[2].toLowerCase().replace("marco", "março"));
  if (month < 0) return null;
  const day = Number(m[1]);
  if (m[3]) return parseLocalDate(isoDay(Number(m[3]), month, day));
  const today = todayBRT();
  const options = [-1, 0, 1].map((dy) => parseLocalDate(isoDay(today.getFullYear() + dy, month, day)));
  return options.reduce((best, d) => (Math.abs(d.getTime() - today.getTime()) < Math.abs(best.getTime() - today.getTime()) ? d : best));
}

/** Resposta à pergunta "quais cartões importo?". Devolve true se tratou a mensagem. */
async function applyStatementChoice(text: string, config: AgentConfig): Promise<boolean> {
  if (!pendingStatement) return false;
  if (Date.now() - pendingStatement.at > STATEMENT_CHOICE_WINDOW_MS) {
    pendingStatement = null;
    return false;
  }
  const answer = text.trim().toLowerCase();
  if (/^cancela/.test(answer)) {
    pendingStatement = null;
    await notifyOwner(config, "👍 Ok, não importei essa fatura.");
    return true;
  }
  // Frase longa não é resposta à pergunta (ex: "gastei 2 reais no pão").
  if (answer.length > 40) return false;
  const { sections, text: statementText, total } = pendingStatement;
  const normalize = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  let chosen: CardSection[];
  if (/\b(tud[oa]|todos|todas|ambos|os dois|as duas)\b/.test(answer)) {
    chosen = sections;
  } else {
    const numbers = (answer.match(/\d+/g) ?? []).map(Number).filter((n) => n >= 1 && n <= sections.length);
    const words = normalize(answer).split(/[^A-Z]+/).filter((w) => w.length >= 3);
    // Só o primeiro nome: titular e adicional costumam ter o mesmo sobrenome.
    chosen = sections.filter((sec, i) => numbers.includes(i + 1) || words.includes(normalize(sec.holder).split(/[^A-Z]+/)[0]));
  }
  if (chosen.length === 0) return false;

  pendingStatement = null;
  await notifyOwner(config, `👍 Importando ${chosen.length === sections.length ? "todos os cartões" : chosen.map((sec) => sec.holder).join(" e ")}…`);
  await importCardSections(config, statementText, chosen, chosen.length === sections.length ? total : null);
  return true;
}

/**
 * Igual a handleStatementDocument, mas a partir de uma foto/print de extrato
 * — usado quando o PDF não tem texto extraível ou quando o usuário manda a
 * imagem direto.
 */
// Print de compra/estorno esperando o "sim" dele para ser gravado.
type ImageDraft = {
  reading: import("./personal-router").ImageReading;
  at: number;
  /** Pix que bate com uma fatura em aberto: o "sim" dá baixa na fatura em vez de lançar gasto. */
  invoice?: { card: string; dueDate: string; total: number };
};
let pendingImageDraft: ImageDraft | null = null;
// Prints que chegaram enquanto outro esperava o "sim": um por vez, na ordem
// (antes o segundo apagava o primeiro e a compra sumia).
let imageDraftQueue: ImageDraft[] = [];
const CONFIRM_YES_RE = /^(sim|s|isso|pode|pode sim|pode salvar|confirma|confirmo|ok|salva|lança|lanca)[.!]*$/i;

// Print + texto mandados juntos ("Pix para água, Zé Alberto" logo depois do
// comprovante): o texto chega enquanto a IA ainda lê o print. Em vez de
// perguntar o valor (que está no print), o texto vira a descrição/categoria
// do lançamento do print.
const IMAGE_NOTE_WINDOW_MS = 3 * 60 * 1000;
let imageArrivedAt = 0;
let imageReading = false; // a IA ainda está lendo um print sem legenda
let imageNote: { description: string; category: string; subcategory: string; at: number } | null = null;

/** Chamado pelo webhook assim que chega um print sem legenda no canal pessoal. */
export function noteImageArriving(): void {
  imageArrivedAt = Date.now();
  imageReading = true;
  imageNote = null;
}

function applyNoteToReading(reading: import("./personal-router").ImageReading): void {
  if (!imageNote || Date.now() - imageNote.at > IMAGE_NOTE_WINDOW_MS) return;
  // "Pix para JOSE ALBERTO …" do comprovante vira "(JOSE ALBERTO …)" depois da descrição dele.
  const fromPrint = (reading.description || "").replace(/^(pix|transfer[eê]ncia|pagamento)\s+(para|pra|a)\s+/i, "").trim();
  const who = fromPrint && !fromPrint.toLowerCase().includes(imageNote.description.toLowerCase()) ? ` (${fromPrint})` : "";
  if (imageNote.description) reading.description = `${imageNote.description}${who}`.slice(0, 120);
  if (imageNote.category && imageNote.category !== "Outros") {
    reading.category = imageNote.category;
    reading.subcategory = imageNote.subcategory;
  }
  imageNote = null;
}
const CONFIRM_NO_RE = /^(n[aã]o|nao|cancela|deixa|esquece)[.!]*$/i;

/**
 * Print sem legenda: a IA diz o que é. Nota fiscal e fatura vão para os
 * leitores próprios; compra/comprovante e estorno viram um cartão com
 * "Confirma?" (nada é gravado sem o "sim"); outra coisa é explicada.
 */
export async function handleSmartImage(base64: string, mimetype: string, caption: string): Promise<void> {
  return withReason(`print${caption ? ` ("${caption.slice(0, 60)}")` : ""}`, () => handleSmartImageInner(base64, mimetype, caption));
}
async function handleSmartImageInner(base64: string, mimetype: string, caption: string): Promise<void> {
  try {
    await readSmartImage(base64, mimetype, caption);
  } finally {
    imageReading = false;
    // Sem cartão de print esperando, um texto depois disso é mensagem normal.
    if (!pendingImageDraft) imageArrivedAt = 0;
  }
}

async function readSmartImage(base64: string, mimetype: string, caption: string): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;
  const reading = await readImage(base64, mimetype, getProviderOpts(config), caption, todayBRT().toISOString().slice(0, 10));
  console.log(`[image] print classificado como ${reading.kind}`);
  if (reading.kind === "compra" || reading.kind === "estorno") applyNoteToReading(reading);

  if (reading.kind === "nota_fiscal") return handleInvoiceImage(base64, mimetype, caption);
  if (reading.kind === "fatura") return handleStatementImage(base64, mimetype);

  // Comprovante de Pix com o valor de uma fatura em aberto (ex: o Pix para o
  // irmão que paga o cartão): oferece dar baixa na fatura, sem lançar gasto.
  if (reading.kind === "compra" && reading.paymentMethod !== "cartão" && reading.amount > 0) {
    const match = (await listOpenInvoices()).find((i) => Math.abs(i.total - reading.amount) <= 1);
    if (match) return offerImageDraft({ reading, at: Date.now(), invoice: { card: match.card, dueDate: match.dueDate, total: match.total } }, config);
  }

  if ((reading.kind === "compra" || reading.kind === "estorno") && reading.amount > 0) return offerImageDraft({ reading, at: Date.now() }, config);

  await notifyOwner(
    config,
    `📸 ${reading.summary || "Não consegui entender bem esse print."}${reading.suggestion ? `\n💡 ${reading.suggestion}` : ""}\n\nSe for uma compra, manda de novo com a legenda *compra*; se for fatura, com *fatura*.`
  );
}

/** Texto do cartão de confirmação de um print (compra/estorno ou baixa de fatura). */
async function draftPrompt(d: ImageDraft, config: AgentConfig): Promise<string> {
  const { reading } = d;
  if (d.invoice) {
    return `📸 ${reading.summary || "Comprovante de Pix."}\n\n💳 Esse valor bate com a fatura *${invoiceLabel(d.invoice.card)}* de ${d.invoice.dueDate.slice(8, 10)}/${d.invoice.dueDate.slice(5, 7)} (${brl(d.invoice.total)}).\nÉ o pagamento dela? Responda *sim* para dar baixa na fatura ou *não* para lançar como gasto normal.`;
  }
  const parcels = reading.installments ? `\n🔢 ${reading.installments}× de ${brl(reading.amount / reading.installments)}` : "";
  return `📸 ${reading.summary || "Entendi o print."}\n\n${entryCard(imageDraftEntry(reading, config), reading.kind === "estorno" ? "↩️ Lançar este estorno?" : "🧐 Lançar esta compra?")}${parcels}\n\nResponda *sim* para salvar ou *não* para descartar. Se algo estiver errado, salve e depois corrija (ex: "na verdade foi 230").`;
}

/** Mostra o print para confirmar; se já tem outro esperando, entra na fila (ou é o mesmo print repetido). */
async function offerImageDraft(d: ImageDraft, config: AgentConfig): Promise<void> {
  // Parece o mesmo print (mesmo valor e dia)? Não descarta (podem ser dois Uber
  // iguais): entra na fila com o aviso, e ele responde *não* se for repetido.
  const same = (a: ImageDraft) => Math.abs(a.reading.amount - d.reading.amount) < 0.01 && (a.reading.date || "") === (d.reading.date || "");
  const ativo = !!pendingImageDraft && (Date.now() - pendingImageDraft.at <= 30 * 60 * 1000 || imageDraftQueue.length > 0);
  // Pendente vencido sem resposta: o próximo da fila vira o da vez (nada some calado).
  if (!ativo && imageDraftQueue.length) {
    pendingImageDraft = { ...imageDraftQueue.shift()!, at: Date.now() };
    imageDraftQueue.push(d);
    await notifyOwner(config, `${await draftPrompt(pendingImageDraft, config)}\n\n📥 Ainda tinha este print esperando; o novo (${brl(d.reading.amount)}) ficou na fila.`);
    return;
  }
  if (ativo) {
    const repetido = same(pendingImageDraft!) || imageDraftQueue.some(same);
    imageDraftQueue.push(d);
    await notifyOwner(
      config,
      `📥 Guardei este print (${brl(d.reading.amount)}) na fila. Primeiro responda *sim* ou *não* para o de ${brl(pendingImageDraft!.reading.amount)}; depois eu mostro este.` +
        (repetido ? `\n⚠️ Parece igual a um que já mandou: se for repetido, responda *não* quando ele aparecer.` : "")
    );
    return;
  }
  pendingImageDraft = d;
  await notifyOwner(config, await draftPrompt(d, config));
}

/** Depois do sim/não: o próximo print da fila vira o que espera resposta ("" se não tem). */
async function nextQueuedDraft(config: AgentConfig): Promise<string> {
  const next = imageDraftQueue.shift();
  if (!next) return "";
  const d: ImageDraft = { ...next, at: Date.now() };
  pendingImageDraft = d;
  return `\n\n➡️ Próximo da fila:\n${await draftPrompt(d, config)}`;
}

/** Lançamento que o print vira (sem gravar): data/fatura e status pelo meio de pagamento. */
function imageDraftEntry(r: import("./personal-router").ImageReading, config: AgentConfig) {
  const purchase = r.date ? parseLocalDate(r.date) : todayBRT();
  const isCard = r.paymentMethod === "cartão";
  const date = isCard ? creditCardBillDate(purchase, config.creditCardDueDay || 10, config.creditCardBestDay || 5) : purchase;
  return {
    description: r.description || (r.kind === "estorno" ? "Estorno" : "Compra"),
    category: r.kind === "estorno" ? "Outros" : r.category,
    subcategory: r.kind === "estorno" ? "Reembolso" : r.subcategory,
    amount: r.amount,
    type: r.kind === "estorno" ? "income" : "expense",
    paymentMethod: r.paymentMethod,
    status: isCard ? "pending" : "paid",
    date,
    purchaseDate: purchase,
    account: r.paymentMethod === "ticket" ? "VR" : "Principal",
  };
}

/** "sim"/"não" depois do cartão do print. Devolve a resposta, ou null se não for o caso. */
async function applyImageDraftReply(text: string, config: AgentConfig): Promise<string | null> {
  if (!pendingImageDraft) return null;
  // Vence em 30 min, a não ser que tenha fila atrás (aí espera a resposta, para a fila andar).
  if (Date.now() - pendingImageDraft.at > 30 * 60 * 1000 && !imageDraftQueue.length) {
    pendingImageDraft = null;
    return null;
  }
  const t = text.trim();
  const draft = pendingImageDraft;
  if (CONFIRM_NO_RE.test(t)) {
    // "não" para a baixa da fatura: vira o cartão normal de gasto, perguntando de novo.
    if (draft.invoice) {
      pendingImageDraft = { reading: draft.reading, at: Date.now() };
      return `Ok! Então lanço como gasto?\n\n${entryCard(imageDraftEntry(draft.reading, config), "🧐 Lançar esta compra?")}\n\nResponda *sim* para salvar ou *não* para descartar.`;
    }
    pendingImageDraft = null;
    return "👍 Ok, não lancei o print." + (await nextQueuedDraft(config));
  }
  if (!CONFIRM_YES_RE.test(t)) return null;
  const { reading } = draft;
  pendingImageDraft = null;
  // "Quanto foi…?" perguntado sobre o mesmo gasto do print: já respondido.
  if (pendingAmount && Date.now() - pendingAmount.at < IMAGE_NOTE_WINDOW_MS) pendingAmount = null;
  if (draft.invoice) {
    const { ids, total } = await payInvoice(draft.invoice.card, draft.invoice.dueDate);
    lastInvoicePayment = { ids, at: Date.now() };
    lastSaved = null;
    return `✅ Fatura paga: *${invoiceLabel(draft.invoice.card)}* de ${draft.invoice.dueDate.slice(8, 10)}/${draft.invoice.dueDate.slice(5, 7)}\n💳 ${ids.length} compras marcadas como pagas · ${brl(total)}\n↩️ Foi engano? Responda *desfazer*.` + (await nextQueuedDraft(config));
  }
  const d = imageDraftEntry(reading, config);
  lastSaved = { since: new Date() };
  pendingInvoiceDraft = null;
  lastInvoicePayment = null;

  if (reading.installments && d.type === "expense" && d.paymentMethod === "cartão") {
    const compraEm = `${String(d.purchaseDate.getDate()).padStart(2, "0")}/${String(d.purchaseDate.getMonth() + 1).padStart(2, "0")}`;
    await saveStatementEntries(config, [{
      date: d.date.toISOString(),
      purchaseDate: d.purchaseDate.toISOString(),
      description: `${d.description} - Parcela 1/${reading.installments} (compra em ${compraEm})`,
      amount: Math.round((d.amount / reading.installments) * 100) / 100,
      type: "expense",
      category: d.category,
      subcategory: d.subcategory,
      paymentMethod: "cartão",
      account: d.account,
      status: "pending",
    }], "o print");
    return `↩️ Se algo saiu errado, responda *desfazer*.` + (await nextQueuedDraft(config));
  }

  const created = await prisma.financeEntry.create({
    data: { ...d, source: "whatsapp" },
  });
  return `${entryCard(created)}\n\n${UNDO_HINT}` + (await nextQueuedDraft(config));
}

export async function handleStatementImage(base64: string, mimetype: string): Promise<void> {
  return withReason(`print da fatura`, () => handleStatementImageInner(base64, mimetype));
}
async function handleStatementImageInner(base64: string, mimetype: string): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  const providerOpts = getProviderOpts(config);
  const entries = await parseStatementImage(base64, mimetype, providerOpts, config.ownerName);
  await saveStatementEntries(config, entries, "a imagem");
}

/** Nome do item da nota normalizado para comparar compras (mercado abrevia sempre igual). */
const itemKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
/** Preço efetivamente pago por unidade/kg (já com desconto), não o de tabela. */
const paidUnitPrice = (i: { amount: number; quantity: number; unitPrice: number }) =>
  i.quantity > 0 && i.amount > 0 ? i.amount / i.quantity : i.unitPrice;

/**
 * Detetive do mercado: compara cada item da nota nova com a última vez que o
 * mesmo item foi comprado (outra nota) e lista o que mudou ≥5% e ≥R$ 0,20.
 */
async function priceChanges(entryId: string, items: { name: string; amount: number; quantity: number; unitPrice: number }[]): Promise<string> {
  const previous = await prisma.invoiceItem.findMany({
    where: { financeEntryId: { not: entryId } },
    orderBy: { createdAt: "desc" },
    take: 3000,
    select: { name: true, amount: true, quantity: true, unitPrice: true, createdAt: true },
  });
  const lastByKey = new Map<string, (typeof previous)[number]>();
  for (const p of previous) if (!lastByKey.has(itemKey(p.name))) lastByKey.set(itemKey(p.name), p);

  const seen = new Set<string>();
  const changes: { text: string; pct: number }[] = [];
  for (const i of items) {
    const key = itemKey(i.name);
    const last = lastByKey.get(key);
    if (!last || seen.has(key)) continue;
    seen.add(key);
    const before = paidUnitPrice(last);
    const now = paidUnitPrice(i);
    if (before <= 0 || now <= 0) continue;
    const pct = ((now - before) / before) * 100;
    if (Math.abs(pct) < 5 || Math.abs(now - before) < 0.2) continue;
    changes.push({
      pct,
      text: `${pct > 0 ? "📈" : "📉"} ${i.name}: ${brl(before)} → ${brl(now)} (${pct > 0 ? "+" : ""}${pct.toFixed(0)}%, desde ${formatDayMonth(last.createdAt)})`,
    });
  }
  if (changes.length === 0) return "";
  changes.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  return `\n\n🛒 *Detetive do mercado:*\n${changes.slice(0, 6).map((c) => c.text).join("\n")}`;
}

export async function handleInvoiceImage(base64: string, mimetype: string, caption: string): Promise<void> {
  return withReason(`foto da nota fiscal`, () => handleInvoiceImageInner(base64, mimetype, caption));
}
async function handleInvoiceImageInner(base64: string, mimetype: string, caption: string): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  const providerOpts = getProviderOpts(config);
  const sumOf = (inv: InvoiceEntry) => inv.items.reduce((acc, i) => acc + (i.amount || i.quantity * i.unitPrice), 0);
  const gapOf = (inv: InvoiceEntry | null) => (inv && inv.items.length ? Math.abs(inv.total - sumOf(inv)) : Infinity);
  let invoice = await parseInvoiceImage(base64, mimetype, providerOpts, config.ownerName, caption);

  // NFC-e do Ceará com a chave legível na foto: itens, quantidades e total
  // oficiais da SEFAZ no lugar da leitura da IA (que fica só para a categoria
  // de cada item e a forma de pagamento — o VR aparece como "débito" lá).
  let daSefaz = false;
  if (invoice?.accessKey) {
    const chave = repairNfeKey(invoice.accessKey, { cnpj: invoice.issuerCnpj, serie: invoice.nfceSeries, numero: invoice.nfceNumber });
    if (chave && chave !== invoice.accessKey.replace(/\D/g, "")) console.log("[nfce] chave lida com dígito errado: consertada pelo CNPJ/série/número da nota");
    const nf = chave ? await fetchNfce(chave) : null;
    if (nf) {
      const n = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const lidos = invoice.items;
      // Categoria do item: a da leitura da foto; se a foto não tinha os itens
      // (só o rodapé com a chave), a da última compra do mesmo produto.
      const antes = await prisma.invoiceItem.findMany({ where: { name: { in: nf.items.map((i) => i.name) } }, select: { name: true, category: true }, orderBy: { createdAt: "desc" } });
      const categoriaDe = (nome: string) => {
        const a = n(nome);
        const igual = lidos.find((i) => n(i.name) === a) ?? lidos.find((i) => a.startsWith(n(i.name).slice(0, 10)) || n(i.name).startsWith(a.slice(0, 10)));
        return igual?.category || antes.find((x) => x.name === nome)?.category || invoice!.category || "Outros";
      };
      invoice = {
        ...invoice,
        total: nf.total,
        date: nf.date ?? invoice.date,
        itemCount: nf.items.length,
        items: nf.items.map((i) => ({ name: i.name, category: categoriaDe(i.name), quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount })),
        fromSefaz: true,
      };
      // Desconto/acréscimo da nota (a SEFAZ dá à parte: "Descontos R$ 23,02"):
      // valores oficiais, então entra como item e a conta fecha sem perguntar.
      const dif = Math.round((nf.total - invoice.items.reduce((a, i) => a + i.amount, 0)) * 100) / 100;
      if (Math.abs(dif) >= 0.01) invoice.items.push({ name: dif < 0 ? "Desconto da Nota" : "Acréscimo da Nota", category: "Desconto / Ajuste", quantity: 1, unitPrice: dif, amount: dif });
      daSefaz = true;
      console.log(`[nfce] nota da SEFAZ: ${nf.items.length} itens, total ${nf.total}`);
    }
  }

  // Nota comprida (40+ itens) às vezes perde linhas: relê com um modelo mais
  // forte e fica com a leitura que fechou melhor.
  if (!daSefaz && gapOf(invoice) > 15 && providerOpts.openrouterApiKey) {
    console.log(`[invoice] conta não fechou (diferença ${gapOf(invoice).toFixed(2)}): relendo com modelo mais forte`);
    const again = await parseInvoiceImage(base64, mimetype, providerOpts, config.ownerName, caption, VISION_FALLBACK);
    if (gapOf(again) < gapOf(invoice)) invoice = again;
  }

  if (!invoice || invoice.items.length === 0) {
    await notifyOwner(config, `⚠️ Não consegui ler os itens dessa nota fiscal. A imagem pode estar embaçada.`);
    return;
  }

  // Nome lido pela foto com 1–2 letras trocadas ("CUXINHA", "CERU HEINEKEN",
  // "2200" no lugar de "220G"): se já existe o mesmo produto nas compras
  // anteriores, usa o nome que já está lá. A SEFAZ já vem com o nome certo.
  if (!invoice.fromSefaz) {
    const conhecidos = [...new Set((await prisma.invoiceItem.findMany({ select: { name: true }, orderBy: { createdAt: "desc" }, take: 3000 })).map((x) => x.name))];
    const dist = (a: string, b: string) => {
      if (Math.abs(a.length - b.length) > 2) return 99;
      const d = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) {
        let prev = d[0];
        d[0] = i;
        for (let j = 1; j <= b.length; j++) {
          const tmp = d[j];
          d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
          prev = tmp;
        }
      }
      return d[b.length];
    };
    for (const it of invoice.items) {
      const nome = it.name.toUpperCase().trim();
      if (nome.length < 8 || conhecidos.includes(it.name)) continue;
      // Números (tamanho/peso) têm que bater: "80G" ≠ "90G", "1L" ≠ "2L" são produtos diferentes.
      const nums = (t: string) => (t.match(/\d+/g) || []).join(",");
      const parecido = conhecidos.find((c) => nums(c) === nums(it.name) && dist(nome, c.toUpperCase()) <= 2);
      if (parecido) {
        console.log(`[invoice] nome corrigido pelo histórico: "${it.name}" → "${parecido}"`);
        it.name = parecido;
      }
    }
  }

  let calculatedTotal = sumOf(invoice);
  const diff = Number((invoice.total - calculatedTotal).toFixed(2));

  // Desconto de até R$ 15 (total menor que a soma) ou arredondamento de
  // centavos: insere um item de ajuste para fechar a conta. Total MAIOR que a
  // soma quase sempre é o total lido errado (ex.: 113,84 lido como 119,64) ou
  // item que faltou — aí pergunta em vez de inventar um "acréscimo".
  if ((diff <= -0.01 && diff >= -15.0) || (diff >= 0.01 && diff <= 0.1)) {
    invoice.items.push({
      name: diff < 0 ? "Desconto da Nota" : "Ajuste / Acréscimo Nota",
      category: "Desconto / Ajuste",
      quantity: 1,
      unitPrice: diff,
      amount: diff
    });
    calculatedTotal = invoice.total;
  } else if (Math.abs(diff) >= 0.01) {
    // Não grava sozinha: pergunta. O dinheiro que saiu é o total da nota; o
    // que faltou ler vira um item "Itens não lidos".
    console.log(`[invoice] conta não fechou: total ${invoice.total}, soma ${calculatedTotal.toFixed(2)} em ${invoice.items.length} itens`);
    pendingInvoiceDraft = { invoice, caption, at: Date.now() };
    await notifyOwner(
      config,
      `⚠️ *Conta não fechou.* Li ${invoice.items.length} itens somando ${brl(calculatedTotal)}, mas o total da nota parece ser ${brl(invoice.total)} (${diff > 0 ? `diferença de ${brl(diff)} — total lido errado ou item que faltou` : `${brl(-diff)} a mais nos itens`}).\n\n` +
        `• *sim* → salvo com o total ${brl(invoice.total)} (a diferença vira "Itens não lidos")\n` +
        `• *soma* → o total certo é a soma dos itens (${brl(calculatedTotal)})\n` +
        `• mande o *total certo* (ex: 145,19) se eu li o total errado\n` +
        `• *não* → descarto`
    );
    return;
  }

  await notifyOwner(config, await saveParsedInvoice(config, invoice, caption));
}

// Depois de "Como você estava no dia…?": a resposta vai para o diário DAQUELE
// dia e marca o humor da nota.
let pendingMoodAsk: { entryId: string; day: Date; at: number } | null = null;

/** 00:00 e 23:59:59 (horário de Brasília) do dia de `d`. */
function brtDayRange(d: Date): { start: Date; end: Date } {
  const BRT = 3 * 3600_000, DAY = 86_400_000;
  const start = new Date(d.getTime() - ((((d.getTime() - BRT) % DAY) + DAY) % DAY));
  return { start, end: new Date(start.getTime() + DAY - 1) };
}

/** Humor já anotado no diário do dia do gasto (ou "neutro"). */
async function diaryMoodOn(day: Date): Promise<string> {
  const { start, end } = brtDayRange(day);
  const d = await prisma.diaryEntry.findFirst({ where: { date: { gte: start, lte: end }, mood: { not: "" } }, orderBy: { date: "desc" } });
  return d && d.mood && d.mood !== "neutro" ? d.mood : "neutro";
}

/** Pergunta do humor sobre o DIA DO GASTO; a resposta vai para o diário desse dia. */
function askMoodFor(entryId: string, purchaseDate: Date, lead: string): string {
  const { start, end } = brtDayRange(purchaseDate);
  pendingMoodAsk = { entryId, day: start, at: Date.now() };
  if (start.getTime() <= Date.now() && Date.now() <= end.getTime()) {
    return `\n\n🤔 ${lead} Como você está se sentindo hoje? (Seu humor me ajuda a mapear seus gastos emocionais!)`;
  }
  const b = new Date(start.getTime() - 3 * 3600_000);
  return `\n\n🤔 ${lead} Como você estava no dia ${String(b.getUTCDate()).padStart(2, "0")}/${String(b.getUTCMonth() + 1).padStart(2, "0")}? (Anoto no diário desse dia.)`;
}

// Nota cuja soma dos itens não bateu com o total, esperando a decisão dele.
let pendingInvoiceDraft: { invoice: InvoiceEntry; caption: string; at: number } | null = null;

/** Resposta ao "Conta não fechou": sim / total certo / não. */
async function applyInvoiceDraftReply(text: string, config: AgentConfig): Promise<string | null> {
  const draft = pendingInvoiceDraft;
  if (!draft) return null;
  if (Date.now() - draft.at > 30 * 60 * 1000) {
    pendingInvoiceDraft = null;
    return null;
  }
  const t = text.trim();
  if (CONFIRM_NO_RE.test(t)) {
    pendingInvoiceDraft = null;
    return "👍 Ok, descartei essa nota.";
  }
  const m = t.match(/^(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)$/i);
  const useSum = /^(?:a\s+)?soma(?:\s+dos\s+itens)?[.!]?$/i.test(t);
  if (!CONFIRM_YES_RE.test(t) && !m && !useSum) return null;
  const inv = draft.invoice;
  const sum = inv.items.reduce((acc, i) => acc + (i.amount || i.quantity * i.unitPrice), 0);
  if (useSum) inv.total = Math.round(sum * 100) / 100;
  else if (m) {
    const total = Number(m[1].replace(/\.(?=\d{3})/g, "").replace(",", "."));
    // "2" (resposta do pix/cartão de outro gasto) não é o total da nota.
    if (!(total >= sum * 0.5 && total <= sum * 2)) return null;
    inv.total = total;
  }
  pendingInvoiceDraft = null;
  const gap = Math.round((inv.total - sum) * 100) / 100;
  if (Math.abs(gap) >= 0.01) {
    inv.items.push({ name: gap > 0 ? "Itens não lidos" : "Desconto / ajuste", category: "Desconto / Ajuste", quantity: 1, unitPrice: gap, amount: gap });
  }
  return saveParsedInvoice(config, inv, draft.caption);
}

/** Grava a nota (com os itens) e devolve a mensagem de confirmação. */
async function saveParsedInvoice(config: AgentConfig, invoice: InvoiceEntry, caption: string): Promise<string> {
  const providerOpts = getProviderOpts(config);
  let invoiceDate = invoice.date ? parseLocalDate(invoice.date) : todayBRT();
  // Valida o ano: só aceita ano atual ±1 (ex: 2025-2027 em 2026)
  const currentYear = new Date().getFullYear();
  if (invoiceDate.getFullYear() < currentYear - 1 || invoiceDate.getFullYear() > currentYear + 1) {
    invoiceDate = todayBRT();
  }
  const purchaseDate = new Date(invoiceDate);
  
  // Débito/pix/dinheiro/ticket só quando a nota mostra isso; qualquer outra
  // coisa (crédito, TEF crédito, ou não deu pra ler) vira cartão de crédito,
  // que é o normal do dono — a confirmação pergunta se foi outro meio.
  const readMethod = (invoice.paymentMethod || "").toLowerCase();
  let paymentMethod: string;
  let account = "Principal";
  let status: "paid" | "pending" = "paid";

  // Legenda "vr"/"vale" manda: na nota o cartão do VR aparece como "débito".
  if (readMethod === "ticket" || (invoice.account || "").toLowerCase().includes("ticket") || /\b(vr|va|vale|ticket|multi)\b/i.test(caption)) {
    paymentMethod = "ticket";
    account = "VR";
  } else if (/d[ée]bito/.test(readMethod)) {
    paymentMethod = "débito";
  } else if (/pix|dinheiro|esp[ée]cie|boleto/.test(readMethod)) {
    paymentMethod = readMethod.includes("pix") ? "pix" : readMethod.includes("boleto") ? "boleto" : "dinheiro";
  } else {
    paymentMethod = "cartão";
    status = "pending";
  }
  if (paymentMethod !== "cartão") invoiceDate = purchaseDate;

  if (status === "pending" && paymentMethod === "cartão") {
    invoiceDate = creditCardBillDate(purchaseDate, config.creditCardDueDay || 10, config.creditCardBestDay || 5);
  }

  // Humor do DIA DA COMPRA (nota de anteontem usa o diário de anteontem).
  const finalMood = await diaryMoodOn(purchaseDate);

  const entry = await prisma.financeEntry.create({
    data: {
      type: "expense",
      amount: invoice.total,
      category: invoice.category || "Alimentação",
      subcategory: invoice.subcategory || "Supermercado",
      description: `Nota Fiscal (${invoice.items.length} itens) - ${caption}`,
      date: invoiceDate,
      purchaseDate: purchaseDate,
      paymentMethod: paymentMethod,
      account: account,
      status: status,
      mood: finalMood,
      source: "whatsapp",
      invoiceItems: {
        create: invoice.items.map(i => ({
          name: i.name,
          category: normalizeItemCategory(i),
          amount: i.amount,
          quantity: i.quantity,
          unitPrice: i.unitPrice
        }))
      }
    }
  });

  // Legenda com divisão ("100 no VR e 80 no cartão"): divide já. Senão, guarda
  // a nota para uma divisão mandada logo depois.
  lastNotaEntry = { id: entry.id, at: Date.now() };
  const captionSplit = parseSplit(caption, invoice.total);
  const splitText = captionSplit && !("erro" in captionSplit) ? await applySplit(entry.id, captionSplit) : captionSplit ? `✂️ ${captionSplit.erro}` : "";
  if (splitText && !splitText.includes("somam")) lastNotaEntry = null;

  const detective = await priceChanges(entry.id, invoice.items).catch((err) => {
    console.error("[detetive] falha ao comparar preços", err);
    return "";
  });

  const payLine = splitText && !splitText.includes("somam") && !splitText.includes("não sobra")
    ? splitText
    : `Pagamento: ${paymentLabel(paymentMethod, invoiceDate)}.\n${paymentMethod === "cartão" ? PAYMENT_QUESTION : paymentMethod === "ticket" ? "Se não foi no VR, responda *1* cartão · *2* pix · *3* débito." : "Pagou de outro jeito? Responda *1* cartão · *2* pix · *5* VR"}\nPagou parte em cada? Responda *100 no VR e o resto no cartão*.${splitText ? `\n${splitText}` : ""}`;
  let response = `✅ Nota fiscal de ${brl(invoice.total)} salva com sucesso!\n(${invoice.items.length} itens registrados em detalhes na sua dashboard${invoice.fromSefaz ? " — conferidos na SEFAZ, valores oficiais" : ""})\n${payLine}${detective}`;

  if (finalMood === "neutro") response += askMoodFor(entry.id, purchaseDate, "Percebi esse gasto.");

  // Teto da categoria (aviso a partir de 70%) e previsão do mês — mesma regra
  // do gasto lançado por mensagem.
  const { items } = await budgetStatus(entry.date.getFullYear(), entry.date.getMonth());
  const b = items.find((x) => x.category === invoice.category);
  if (b) {
    const percent = (b.spent / b.limit) * 100;
    if (percent >= 100) {
      response += `\n\n🔴 *Teto de ${b.category} estourado:* ${brl(b.spent)} de ${brl(b.limit)} (passou ${brl(b.spent - b.limit)}).`;
    } else if (percent >= 70) {
      response += `\n\n🟡 *Atenção:* ${percent.toFixed(0)}% do teto de ${b.category} (${brl(b.spent)} de ${brl(b.limit)}). Restam ${brl(b.limit - b.spent)} até o fim do mês.`;
    }
    if (percent >= 70 && invoice.total >= 50) {
      try {
        const { content } = await generateResponse(
          [{ role: "user", content: `O Renato registrou uma nota de ${brl(invoice.total)} em ${invoice.category} › ${invoice.subcategory}. No mês já foi ${brl(b.spent)} de um teto de ${brl(b.limit)} (${percent.toFixed(0)}%). Dê um toque amigável e MUITO CURTO (1 frase) para focar no necessário (cuidado com bebida/besteira). Sem sermão.` }],
          "Você é uma assistente financeira.",
          0.7,
          80,
          providerOpts
        );
        response += `\n💬 ${content.trim()}`;
      } catch {
        // sem dica, o número acima já avisa
      }
    }
  }
  // Nota com cerveja/salgadinho: mostra o teto da Besteira (ele pediu para não passar).
  const besteiraNaNota = spreadDiscount(invoice.items).filter(isBesteiraItem).reduce((a, i) => a + i.amount, 0);
  if (besteiraNaNota > 0 && invoice.category !== "Besteira") {
    const bs = items.find((x) => x.category === "Besteira");
    response += bs
      ? `\n\n🍺 *Besteira:* ${brl(besteiraNaNota)} nesta nota · ${brl(bs.spent)} de ${brl(bs.limit)} no mês ${bs.spent >= bs.limit ? `🔴 passou ${brl(bs.spent - bs.limit)}` : bs.spent / bs.limit >= 0.7 ? `🟡 restam ${brl(bs.limit - bs.spent)}` : `🟢 restam ${brl(bs.limit - bs.spent)}`}.`
      : `\n\n🍺 *Besteira nesta nota:* ${brl(besteiraNaNota)}.`;
  }
  response += await monthForecastLine(entry.date.getFullYear(), entry.date.getMonth());
  return response;
}

export interface PrivateMessageMeta {
  phone: string;
  pushName: string;
  messageTimestamp: number;
}

// ── Compromissos das conversas → agenda ──────────────────────────────────
// Última sugestão esperando o "agenda" do dono, e sugestões recentes (para
// não perguntar de novo o mesmo compromisso a cada "ok", "fechado"...).
let pendingCommitment: { title: string; contactName: string; event: Date; hasTime: boolean; at: number } | null = null;
const recentCommitments = new Map<string, number>();
const brtDate = (date: string, time: string | null) => {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = (time ?? "12:00").split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h + 3, mi)); // horário de Brasília → UTC
};
/**
 * Lê o fim da conversa privada (com a IA, interpretando linguagem livre) e,
 * se ficou combinado um compromisso, pergunta ao dono se coloca na agenda.
 * Contato silenciado não passa pela IA.
 */
async function checkCommitment(phone: string, contactName: string, conversationId: string, config: AgentConfig): Promise<void> {
  if (!config.detectCommitments || !config.ownerPhone) return;
  if (config.mutedContacts.split(",").map((p) => p.trim()).includes(phone)) return;
  const recent = await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 8 });
  const convo = recent.reverse().map((x) => `${x.role === "user" ? contactName : "Renato"}: ${x.content}`).join("\n");
  const today = todayBRT();
  const c = await detectCommitment(convo, contactName, today.toISOString().slice(0, 10), WEEKDAYS[today.getDay()], getProviderOpts(config));
  if (!c.found || !c.date) return;
  const event = brtDate(c.date, c.time);
  if (event.getTime() < Date.now() - 3600_000) return; // já passou
  const key = `${phone}|${c.date}|${c.time ?? ""}`;
  if (Date.now() - (recentCommitments.get(key) ?? 0) < 24 * 3600_000) return;
  recentCommitments.set(key, Date.now());
  pendingCommitment = { title: c.title || "Compromisso", contactName, event, hasTime: !!c.time, at: Date.now() };
  await notifyOwner(
    config,
    `📅 *${contactName}*: ${c.title || "compromisso"} — ${WEEKDAYS[new Date(event.getTime() - 3 * 3600_000).getUTCDay()]}, ${fmtBRT(event, !!c.time)}.\nColoco na agenda? Responda *agenda* para salvar (com lembrete). Se não, é só ignorar.`
  );
}

/** "agenda" (salva o compromisso sugerido) e "silencia X" / "volta a ouvir X". */
async function applyCommitmentCommands(text: string, config: AgentConfig): Promise<string | null> {
  const t = text.trim();
  if (/^agenda[.!]*$/i.test(t)) {
    const p = pendingCommitment;
    if (!p || Date.now() - p.at > 24 * 3600_000) return "🤔 Não tenho nenhum compromisso esperando para salvar.";
    pendingCommitment = null;
    // Lembrete: 1h antes; compromisso antes das 9h (ou sem hora) avisa às 21h da véspera.
    const eventBRT = new Date(p.event.getTime() - 3 * 3600_000);
    const early = !p.hasTime || eventBRT.getUTCHours() < 9;
    const remind = early
      ? new Date(Date.UTC(eventBRT.getUTCFullYear(), eventBRT.getUTCMonth(), eventBRT.getUTCDate() - 1, 21 + 3, 0))
      : new Date(p.event.getTime() - 3600_000);
    const when = fmtBRT(p.event, p.hasTime);
    await prisma.agendaItem.create({
      data: {
        source: "self",
        category: "event",
        title: `${p.title} com ${p.contactName} — ${when}`,
        description: `Combinado com ${p.contactName} pelo WhatsApp.`,
        dueDate: remind,
        rawMessage: `compromisso detectado na conversa com ${p.contactName}`,
      },
    });
    return `✅ Na agenda: *${p.title} com ${p.contactName}* — ${when}.\n⏰ Lembrete ${early ? "na véspera às 21h" : "1h antes"}.`;
  }
  const mute = t.match(/^(silencia|silenciar|ignora|ignorar)\s+(o |a )?(.+?)[.!]*$/i);
  const unmute = t.match(/^(volta a ouvir|ouvir de novo|dessilencia)\s+(o |a )?(.+?)[.!]*$/i);
  if (!mute && !unmute) return null;
  const name = (mute ?? unmute)![3];
  const conv = await prisma.conversation.findFirst({ where: { source: "whatsapp", contactName: { contains: name, mode: "insensitive" } }, orderBy: { updatedAt: "desc" } });
  if (!conv || !conv.phone) return `🤔 Não achei nenhuma conversa com "${name}".`;
  const list = new Set(config.mutedContacts.split(",").map((p) => p.trim()).filter(Boolean));
  if (mute) list.add(conv.phone);
  else list.delete(conv.phone);
  await prisma.agentConfig.update({ where: { id: config.id }, data: { mutedContacts: [...list].join(",") } });
  return mute
    ? `🔇 Pronto: as conversas com *${conv.contactName}* não passam mais pela IA. Para voltar: "volta a ouvir ${name}".`
    : `🔊 Voltei a olhar as conversas com *${conv.contactName}* (só para achar compromissos).`;
}

export async function handlePrivateMessage(joinedText: string, meta: PrivateMessageMeta): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.enabled) return;

  const providerOpts = getProviderOpts(config);
  const contactName = meta.pushName || meta.phone;

  // Resumo das mensagens privadas desligado: só guarda a conversa, sem mandar
  // para a IA e sem avisar (eram ~30 avisos/dia, 92% "nada importante").
  if (!config.privateBriefings) {
    let quietConv = await prisma.conversation.findFirst({ where: { phone: meta.phone, source: "whatsapp" } });
    if (!quietConv) {
      quietConv = await prisma.conversation.create({ data: { phone: meta.phone, source: "whatsapp", contactName } });
    }
    await prisma.message.create({ data: { conversationId: quietConv.id, role: "user", content: joinedText } });
    await checkCommitment(meta.phone, quietConv.contactName || contactName, quietConv.id, config);
    return;
  }

  const analysis = await analyzePrivateMessage(joinedText, contactName, config.ownerRole, providerOpts, config.systemPrompt);

  if (analysis.ticketIds.length > 0) {
    await extractAndSaveTickets(analysis.ticketIds, joinedText, contactName, "", "");
  }

  const briefing = await prisma.briefing.create({
    data: {
      phone: meta.phone,
      contactName,
      rawMessage: joinedText,
      summary: analysis.summary,
      subject: analysis.subject,
      urgency: analysis.urgency,
      receivedAt: new Date(meta.messageTimestamp * 1000),
    },
  });

  let conv = await prisma.conversation.findFirst({ where: { phone: meta.phone, source: "whatsapp" } });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { phone: meta.phone, source: "whatsapp", contactName } });
  } else if (conv.nameSource !== "manual" && conv.contactName !== contactName) {
    conv = await prisma.conversation.update({ where: { id: conv.id }, data: { contactName } });
  }
  await prisma.message.create({ data: { conversationId: conv.id, role: "user", content: joinedText } });

  if (config.ownerPhone && config.evolutionUrl) {
    const hora = formatTime(meta.messageTimestamp);
    const urgencyBadge =
      analysis.urgency === "critical"
        ? "\n🚨 *URGENTE*"
        : analysis.urgency === "high"
        ? "\n⚠️ *IMPORTANTE*"
        : "";

    const notification = `👤 *${contactName}* — 🕐 ${hora}\n\n📋 *${analysis.subject}*\n${analysis.summary}${urgencyBadge}`;

    await notifyOwner(config, notification);
    await prisma.briefing.update({ where: { id: briefing.id }, data: { notified: true } });
  }
}

export interface OwnerReplyMeta {
  remoteJid: string;
  messageTimestamp: number;
  pushName?: string;
  isGroup?: boolean;
}

export async function handleOwnerReply(joinedText: string, meta: OwnerReplyMeta): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.enabled) return;

  const phone = meta.isGroup ? meta.remoteJid : meta.remoteJid.replace("@s.whatsapp.net", "");
  const source = meta.isGroup ? "group" : "whatsapp";
  const contactName = meta.pushName || phone;

  let conv = await prisma.conversation.findFirst({ where: { phone, source } });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { phone, source, contactName } });
  }
  
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      role: "assistant",
      content: joinedText,
      createdAt: new Date(meta.messageTimestamp * 1000)
    }
  });

  // O próprio dono às vezes é quem fecha o horário ("fechado, amanhã às 7").
  if (!meta.isGroup) await checkCommitment(phone, conv.contactName || contactName, conv.id, config);
}

// ── Estados de conversa guardados no banco ─────────────────────────────────
// As perguntas que esperam resposta ("sim?", "soma?", o valor que faltou, o
// "desfazer") ficam nas variáveis acima; aqui elas vão para o banco a cada
// poucos segundos e voltam depois de um reinício. O PDF com senha não vai
// (é grande: depois de um reinício ela pede o PDF de novo).
function flowSnapshot(): Record<string, unknown> {
  return {
    lastSaved, pendingAmount, lastInvoicePayment, pendingHighValue, confirmedHighValueText,
    pendingStatement, pendingImageDraft, imageDraftQueue, imageNote, pendingMoodAsk, pendingInvoiceDraft, pendingCommitment, lastHistoryIds,
    pendingQuotedEdit, pendingSplit, lastNotaEntry,
  };
}

let flowsRestored: Promise<void> | null = null;
/** Traz os estados do banco uma vez por processo; depois grava as mudanças a cada 3 s. */
export function restoreFlowStates(): Promise<void> {
  flowsRestored ??= (async () => {
    try {
      const s = await loadFlowStates();
      type S = Record<string, never>;
      const g = s as S;
      if (g.lastSaved) lastSaved = g.lastSaved;
      if (g.pendingAmount) pendingAmount = g.pendingAmount;
      if (g.lastInvoicePayment) lastInvoicePayment = g.lastInvoicePayment;
      if (g.pendingHighValue) pendingHighValue = g.pendingHighValue;
      if (g.confirmedHighValueText) confirmedHighValueText = g.confirmedHighValueText;
      if (g.pendingStatement) pendingStatement = g.pendingStatement;
      if (g.pendingImageDraft) pendingImageDraft = g.pendingImageDraft;
      if (Array.isArray(g.imageDraftQueue)) imageDraftQueue = g.imageDraftQueue;
      if (g.imageNote) imageNote = g.imageNote;
      if (g.pendingMoodAsk) pendingMoodAsk = g.pendingMoodAsk;
      if (g.pendingInvoiceDraft) pendingInvoiceDraft = g.pendingInvoiceDraft;
      if (g.pendingCommitment) pendingCommitment = g.pendingCommitment;
      if (g.lastHistoryIds) lastHistoryIds = g.lastHistoryIds;
      if (g.pendingQuotedEdit) pendingQuotedEdit = g.pendingQuotedEdit;
      if (g.pendingSplit) pendingSplit = g.pendingSplit;
      if (g.lastNotaEntry) lastNotaEntry = g.lastNotaEntry;
      markFlowStatesLoaded(flowSnapshot());
      const voltaram = Object.keys(s);
      if (voltaram.length) console.log(`[estado] recuperado do banco: ${voltaram.join(", ")}`);
    } catch (e) {
      console.error("[estado] não leu do banco:", e);
    }
    setInterval(() => {
      saveFlowStates(flowSnapshot()).catch((e) => console.error("[estado] não gravou:", e));
    }, 3000).unref?.();
  })();
  return flowsRestored;
}
