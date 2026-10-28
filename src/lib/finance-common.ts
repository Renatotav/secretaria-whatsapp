// Peças comuns do financeiro usadas em vários lugares: nomes dos meses, totais do
// mês (com a Besteira de dentro das notas), status do teto, contas de data e de
// período, séries (parcela/recorrente), salário e valores falados (Alexa).
// Saiu de message-handlers.ts (28/10/2026) — sem estado de conversa.

import { prisma } from "./prisma";
import { isBesteiraItem, spreadDiscount } from "./finance-taxonomy";
import { parseLocalDate } from "./dates";
import { brlMsg as brl } from "./format";
import { invoiceLabel, listOpenInvoices } from "./invoices";

export const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Entradas, saídas e saídas por categoria de um mês (pelo `date`, que é o mês em que o dinheiro entra/sai). */
export async function monthTotals(year: number, monthIndex: number) {
  const entries = await prisma.financeEntry.findMany({
    where: { date: { gte: new Date(year, monthIndex, 1), lte: new Date(year, monthIndex + 1, 0, 23, 59, 59) } },
    select: { type: true, amount: true, category: true, invoiceItems: { select: { name: true, category: true, amount: true } } },
  });
  const byCategory: Record<string, number> = {};
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (e.type === "income") income += e.amount;
    else {
      expense += e.amount;
      // Cerveja/salgadinho dentro da nota de mercado conta na Besteira (sai da categoria da nota).
      const besteira = e.category === "Besteira" ? 0 : spreadDiscount(e.invoiceItems).filter(isBesteiraItem).reduce((a, i) => a + i.amount, 0);
      const cat = e.category || "Outros";
      byCategory[cat] = (byCategory[cat] || 0) + e.amount - besteira;
      if (besteira > 0) byCategory.Besteira = (byCategory.Besteira || 0) + besteira;
    }
  }
  return { income, expense, byCategory };
}

/** Tetos do mês (o do mês específico vale mais que o "default") e o gasto de cada categoria. */
export async function budgetStatus(year: number, monthIndex: number) {
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const rows = await prisma.budget.findMany({ where: { subcategory: "", month: { in: [monthKey, "default"] } } });
  const limits = new Map<string, number>();
  for (const b of rows.filter((r) => r.month === "default")) limits.set(b.category, b.amount);
  for (const b of rows.filter((r) => r.month === monthKey)) limits.set(b.category, b.amount);
  const { byCategory } = await monthTotals(year, monthIndex);
  const items = [...limits.entries()]
    .map(([category, limit]) => ({ category, limit, spent: byCategory[category] ?? 0 }))
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);
  const withoutLimit = Object.entries(byCategory).filter(([c, v]) => !limits.has(c) && v > 0);
  return { items, withoutLimit };
}

export const budgetIcon = (pct: number) => (pct >= 100 ? "🔴" : pct >= 70 ? "🟡" : "🟢");

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // 31/01 + 1 mês = 28/02 (último dia), não 03/03: senão o recorrente pula fevereiro.
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

export const isoDay = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export const isInstallment = (d: string) => /Parcela \d+\/\d+/.test(d);

export const isRecurring = (e: { description: string; category: string }) =>
  e.category === "Assinaturas" || (/\((previsto|recorrente)\)/i.test(e.description) && !isInstallment(e.description));

export const baseName = (e: { description: string; category: string; subcategory: string }) =>
  e.description.replace(/\s*\((previsto|recorrente)\)/gi, "").trim() || e.subcategory || e.category;

// ── Resumo do dia e relatório da semana (números do código, não da IA) ──
export const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

export const dayRange = (d: Date) => ({ gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()), lte: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59) });

/** Gastos feitos num período: pela data da compra (no cartão a data é a fatura). */
export async function spentBetween(gte: Date, lte: Date) {
  return prisma.financeEntry.findMany({
    where: {
      type: "expense",
      NOT: { description: { contains: "(previsto)" } },
      OR: [{ purchaseDate: { gte, lte } }, { purchaseDate: null, date: { gte, lte } }],
    },
    orderBy: { amount: "desc" },
  });
}

/** O que vence entre duas datas: contas fora do cartão, faturas e agenda. */
export async function dueBetween(gte: Date, lte: Date): Promise<string[]> {
  const bills = await prisma.financeEntry.findMany({
    where: { type: "expense", status: "pending", paymentMethod: { not: "cartão" }, date: { gte, lte } },
    orderBy: { date: "asc" },
  });
  const invoices = (await listOpenInvoices()).filter((i) => {
    const d = parseLocalDate(i.dueDate);
    return d >= gte && d <= lte && i.total > 0;
  });
  const agenda = await prisma.agendaItem.findMany({ where: { source: { not: "group" }, done: false, dueDate: { gte, lte } }, orderBy: { dueDate: "asc" } });
  return [
    ...bills.map((b) => `• ${(b.description.replace(/\s*\(previsto\)/, "").trim() || b.subcategory || b.category)} — ${brl(b.amount)} (${formatDayMonth(b.date)})`),
    ...invoices.map((i) => `• 💳 ${invoiceLabel(i.card)} — ${brl(i.total)} (${i.dueDate.slice(8, 10)}/${i.dueDate.slice(5, 7)})`),
    ...agenda.map((a) => `• 📅 ${a.title}${a.dueDate ? ` (${formatDayMonth(a.dueDate)})` : ""}`),
  ];
}

export const MESES_FALA = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const reaisFala = (v: number) => `${Math.round(v)} reais`;

export function formatDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Salário de verdade: o VR também está em "Salário" (subcategoria Vale Alimentação, conta VR/Vale antigo). */
export const SO_SALARIO = { subcategory: { not: "Vale Alimentação" }, NOT: { account: { in: ["VR", "Vale antigo"] } } };

export const SALARY_REPLY_MARK = "responda *usa nos próximos*";

/**
 * Previsão do mês: entra − sai lançado − o que ainda vem pelos tetos (dia a
 * dia planejado). Gasto dentro do teto não muda a previsão (já estava
 * planejado); gasto fora do teto derruba — é o aviso "antes de dar ruim".
 */
export async function monthForecast(year: number, monthIndex: number) {
  return (await monthForecastParts(year, monthIndex)).total;
}

/**
 * Resultado do mês na conta corrente, separado em: o que JÁ saiu (pago),
 * o que ainda está a pagar/receber e o que ainda pode sair pelos tetos.
 */
export async function monthForecastParts(year: number, monthIndex: number) {
  // Conta corrente (é ela que vira a Reserva no dia 1º): o VR fica de fora,
  // exceto para pagar a comida que ainda vem pelo teto de Alimentação.
  const isVoucher = (account: string) => /vr|ticket|vale/i.test(account);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59);
  const entries = await prisma.financeEntry.findMany({
    where: { date: { gte: new Date(year, monthIndex, 1), lte: monthEnd } },
    select: { type: true, amount: true, account: true, status: true },
  });
  let checking = 0;
  let done = 0;
  for (const e of entries) {
    if (isVoucher(e.account)) continue;
    const v = e.type === "income" ? e.amount : -e.amount;
    checking += v;
    if (e.status === "paid") done += v;
  }
  const vrEntries = await prisma.financeEntry.findMany({
    where: { date: { lte: monthEnd }, OR: ["VR", "ticket", "vale"].map((w) => ({ account: { contains: w, mode: "insensitive" as const } })) },
    select: { type: true, amount: true },
  });
  const vrAvailable = Math.max(0, vrEntries.reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), 0));
  const { items } = await budgetStatus(year, monthIndex);
  let stillFood = 0;
  let stillOther = 0;
  for (const b of items) {
    const rest = Math.max(0, b.limit - b.spent);
    if (b.category === "Alimentação") stillFood += rest;
    else stillOther += rest;
  }
  const budgetRest = stillOther + Math.max(0, stillFood - vrAvailable);
  return { total: checking - budgetRest, done, pending: checking - done, budgetRest };
}
