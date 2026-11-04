// Comandos e respostas do canal pessoal sem estado de conversa (saíram de message-handlers.ts em 03/11/2026).
import { prisma } from "./prisma";
import { todayBRT, creditCardBillDate } from "./dates";
import type { AgentConfig } from "@prisma/client";
import { brlMsg as brl } from "./format";
import { invoiceLabel, listOpenInvoices } from "./invoices";
import { dayRange, formatDayMonth, MONTH_NAMES, reaisFala, SALARY_REPLY_MARK, SO_SALARIO, spentBetween } from "./finance-common";
import { checkWish, wishLabel } from "./finance-wishes";
import { findReserveGoal } from "./finance-goals";
import { cardLimitData, cardLimitLine } from "./finance-reports";
import { notifyOwner } from "./owner-notify";
import { PAYMENT_OPTIONS, parseBrNumber, paymentLabel } from "./finance-text";

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

/** Véspera da fatura (Alexa, à noite): "Amanhã vence a fatura do seu cartão: 1.234 reais." */
export async function invoiceEveSpeech(): Promise<string> {
  const t = todayBRT();
  const amanha = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
  const key = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, "0")}-${String(amanha.getDate()).padStart(2, "0")}`;
  const faturas = (await listOpenInvoices()).filter((i) => i.dueDate === key && i.total >= 1);
  if (!faturas.length) return "";
  return `Renato, amanhã vence ${faturas.map((f) => `a fatura do ${invoiceLabel(f.card).toLowerCase()}: ${reaisFala(f.total)}`).join("; e ")}. Lembre de pagar inteira.`;
}

export const PAYMENT_QUESTION = "Pagou de outro jeito? Responda *2* pix · *3* débito · *4* dinheiro · *5* VR";
export const PAYMENT_REPLY_WINDOW_MS = 60 * 60 * 1000;
// A mensagem cita uma data, um mês ou a fatura? Só assim a fatura que a IA
// extraiu ("billDate") passa por cima da regra do melhor dia.
export const BILL_STATED_RE = /\d{1,2}\/\d{1,2}|\bfatura\b|\bvencimento\b|\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;
export const PAYMENT_STATED_RE = /\b(pix|d[ée]bito|dinheiro|esp[ée]cie|boleto|cart[ãa]o|cr[ée]dito|ticket|vale|vr|va|multi)\b/i;

export const UNDO_HINT = "↩️ Errou? Responda *desfazer* ou *na verdade foi 25*.";

/**
 * Resposta curta ("2", "pix", "débito"...) logo depois de um gasto lançado
 * pelo WhatsApp: troca o meio de pagamento só desse lançamento e recalcula a
 * data (cartão vai pro vencimento da fatura; o resto sai no dia da compra).
 * Devolve a mensagem de confirmação, ou null se não for esse caso.
 */
/** "5", "vr", "foi no pix", "os dois foram VR" → meio e quantos lançamentos (os últimos); null se não for isso. */
export function parsePaymentReply(text: string): { choice: (typeof PAYMENT_OPTIONS)[string]; count: number } | null {
  const m = text.trim().toLowerCase().replace(/[.!]+$/, "").match(/^(?:(os dois|as duas|ambos|ambas|todos|todas)\s+)?(?:(?:foi|foram|era|eram|paguei)\s+)?(?:(?:no|na|em|com|de|pelo|pela)\s+)?(\S+)$/);
  const choice = m ? PAYMENT_OPTIONS[m[2]] : undefined;
  if (!m || !choice) return null;
  return { choice, count: !m[1] ? 1 : /todo|toda/.test(m[1]) ? 10 : 2 };
}

export async function applyPaymentReply(text: string, config: AgentConfig): Promise<string | null> {
  const parsed = parsePaymentReply(text);
  if (!parsed) return null;
  const { choice, count } = parsed;

  const entries = await prisma.financeEntry.findMany({
    where: {
      source: "whatsapp",
      type: "expense",
      createdAt: { gte: new Date(Date.now() - PAYMENT_REPLY_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    take: count,
  });
  if (!entries.length || entries.some((e) => /Parcela \d+\/\d+/.test(e.description))) return null;

  const lines: string[] = [];
  for (const entry of entries) {
    const label = entry.description || entry.category;
    if (entry.paymentMethod === choice) {
      lines.push(`👍 "${label}" (${brl(entry.amount)}) já estava como ${paymentLabel(entry.paymentMethod, entry.date)}.`);
      continue;
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
    lines.push(`✅ Corrigido: "${label}" (${brl(entry.amount)}) agora é ${paymentLabel(choice, date)}.`);
  }
  return lines.join("\n");
}

export const SAVINGS_REPLY_MARK = "Responda *guarda*";

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

export const HIGH_VALUE = 500;
