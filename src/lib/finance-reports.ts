// Relatórios e consultas do financeiro (sem IA): resumo do dia/semana, fechamento
// do mês, diagnóstico, categorias, assinaturas, contas a pagar (também falado
// pela Alexa), orçamento, saldo do VR, limite do cartão e check-up do salário.
// Saiu de message-handlers.ts (28/10/2026) — sem estado de conversa.

import { prisma } from "./prisma";
import { generateResponse, type ProviderOptions } from "./openai";
import { type PersonalQueryIntent } from "./personal-router";
import { todayBRT, creditCardBillDate } from "./dates";
import { brlMsg as brl } from "./format";
import { scooterDigestLine } from "./scooter";
import { workDigestLine, workWeekSection } from "./work";
import { baseName, budgetIcon, budgetStatus, dayRange, dueBetween, formatDayMonth, isInstallment, isRecurring, MESES_FALA, MONTH_NAMES, monthForecastParts, monthTotals, reaisFala, SALARY_REPLY_MARK, SO_SALARIO, spentBetween, WEEKDAYS } from "./finance-common";
import { buildWishList, checkWish } from "./finance-wishes";
import { findReserveGoal, goalMonthlyNeed, goalsViabilityLine, reserveNow } from "./finance-goals";

/**
 * Fechamento de um mês: entrou x saiu, top 3 categorias contra o mês
 * anterior e as metas. Usado pelo agendador todo dia 1º e por
 * "fechamento do mês" no WhatsApp.
 */
export async function buildMonthClosing(year: number, monthIndex: number): Promise<string> {
  const cur = await monthTotals(year, monthIndex);
  const prevDate = new Date(year, monthIndex - 1, 1);
  const prev = await monthTotals(prevDate.getFullYear(), prevDate.getMonth());
  const balance = cur.income - cur.expense;

  const top = Object.entries(cur.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topLines = top.map(([cat, v]) => {
    const before = prev.byCategory[cat] || 0;
    const diff = before > 0 ? ` (${v >= before ? "↑" : "↓"} ${Math.abs(((v - before) / before) * 100).toFixed(0)}% vs ${MONTH_NAMES[prevDate.getMonth()]})` : "";
    return `• ${cat}: ${brl(v)}${diff}`;
  });

  const goals = await prisma.savingsGoal.findMany({ orderBy: { createdAt: "asc" } });
  const goalLines = goals.map((g) =>
    g.currentAmount >= g.targetAmount
      ? `• 🏆 ${g.name}: conquistada`
      : `• ${g.name}: ${brl(g.currentAmount)} de ${brl(g.targetAmount)} (${((g.currentAmount / g.targetAmount) * 100).toFixed(0)}%)`
  );

  return [
    `📅 *Fechamento de ${MONTH_NAMES[monthIndex]}/${year}*`,
    `Entrou: ${brl(cur.income)}`,
    `Saiu: ${brl(cur.expense)}`,
    `${balance >= 0 ? "🟢 Sobrou" : "🔴 Faltou"}: ${brl(Math.abs(balance))}`,
    top.length ? `\n*O que mais pesou:*\n${topLines.join("\n")}` : "",
    goalLines.length ? `\n*Metas:*\n${goalLines.join("\n")}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * Gastos de uma categoria no mês (ou só de uma subcategoria, se ele perguntou
 * por "luz", "mercado"...): já pago x a pagar, mês anterior e o teto do
 * orçamento. Devolve o texto e as barras por subcategoria para o gráfico.
 */
export async function categoryMonth(name: string, year: number, monthIndex: number) {
  const range = { gte: new Date(year, monthIndex, 1), lte: new Date(year, monthIndex + 1, 0, 23, 59, 59) };
  const select = { amount: true, status: true, subcategory: true, description: true, category: true };
  const byCategory = await prisma.financeEntry.findMany({
    where: { type: "expense", date: range, category: { equals: name, mode: "insensitive" } },
    select,
  });
  if (byCategory.length) return { entries: byCategory, label: byCategory[0].category };
  const bySub = await prisma.financeEntry.findMany({
    where: { type: "expense", date: range, subcategory: { equals: name, mode: "insensitive" } },
    select,
  });
  return { entries: bySub, label: bySub[0]?.subcategory };
}

export async function buildCategorySummary(name: string | undefined) {
  if (!name) return { text: "🤔 Não entendi de qual categoria. Ex: \"como está meu gasto com moradia?\"", bars: [], title: "" };
  const today = todayBRT();
  const y = today.getFullYear();
  const m = today.getMonth();
  const prevDate = new Date(y, m - 1, 1);
  const curMonth = await categoryMonth(name, y, m);
  const prevMonth = await categoryMonth(name, prevDate.getFullYear(), prevDate.getMonth());
  const cur = curMonth.entries;
  const prev = prevMonth.entries;
  const sum = (l: { amount: number }[]) => l.reduce((s, e) => s + e.amount, 0);
  const label = curMonth.label || prevMonth.label || name;

  if (cur.length === 0 && prev.length === 0) {
    return { text: `🔎 Não achei gastos de *${name}* em ${MONTH_NAMES[m]} nem em ${MONTH_NAMES[prevDate.getMonth()]}.`, bars: [], title: "" };
  }

  const total = sum(cur);
  const paid = sum(cur.filter((e) => e.status === "paid"));
  const prevTotal = sum(prev);
  const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  const budgets = await prisma.budget.findMany({
    where: { category: { equals: label, mode: "insensitive" }, subcategory: "", month: { in: [monthKey, "default"] } },
  });
  const budget = budgets.find((b) => b.month === monthKey) ?? budgets.find((b) => b.month === "default");

  // Agrupa por subcategoria (ou descrição, quando não tem) para o gráfico.
  const group = (l: typeof cur) =>
    l.reduce<Record<string, number>>((acc, e) => {
      const k = e.subcategory || e.description.replace(/\s*-?\s*Parcela \d+\/\d+.*$/, "").trim() || "Outros";
      acc[k] = (acc[k] || 0) + e.amount;
      return acc;
    }, {});
  const curGroups = group(cur);
  const prevGroups = group(prev);
  const bars = Object.entries(curGroups)
    .sort((a, b) => b[1] - a[1])
    .map(([k, value]) => ({ label: k, value, compare: prevGroups[k] }));

  // Próximos meses da mesma categoria: o que ainda vai cair (parcelas,
  // seguro...) — mostra a próxima de cada parte e quanto falta no total.
  const monthEnd = new Date(y, m + 1, 0, 23, 59, 59);
  const future = await prisma.financeEntry.findMany({
    where: {
      type: "expense",
      date: { gt: monthEnd },
      OR: [{ category: { equals: label, mode: "insensitive" } }, { subcategory: { equals: label, mode: "insensitive" } }],
    },
    select: { amount: true, date: true, subcategory: true, category: true },
    orderBy: { date: "asc" },
  });
  const byCategory = future.some((f) => f.category.toLowerCase() === label.toLowerCase());
  const partOf = (e: { subcategory: string; category: string }) => (byCategory ? e.subcategory || "Outros" : e.category);
  const nextByPart = new Map<string, { amount: number; date: Date }>();
  for (const f of future) if (!nextByPart.has(partOf(f))) nextByPart.set(partOf(f), { amount: f.amount, date: f.date });
  const parts = [...new Set([...Object.keys(curGroups), ...nextByPart.keys()])];
  const partLines = parts.map((p) => {
    const next = nextByPart.get(p);
    const nextTxt = next ? `próxima ${brl(next.amount)} em ${formatDayMonth(next.date)}` : "";
    return curGroups[p] ? `• ${p}: ${brl(curGroups[p])}` : `• ${p}: nada este mês${nextTxt ? ` · ${nextTxt}` : ""}`;
  });
  const futureTotal = sum(future);
  const last = future[future.length - 1];

  const diff = total - prevTotal;
  const lines = [
    `📂 *${label} em ${MONTH_NAMES[m]}*`,
    `Total: ${brl(total)} (já pago ${brl(paid)} · a pagar ${brl(total - paid)})`,
    parts.length > 1 || nextByPart.size > 0 ? `\n${partLines.join("\n")}\n` : "",
    prevTotal > 0
      ? `${diff > 0 ? "🔺" : diff < 0 ? "🔻" : "➖"} ${MONTH_NAMES[prevDate.getMonth()]}: ${brl(prevTotal)} (${diff >= 0 ? "+" : "−"}${brl(Math.abs(diff))})`
      : "",
    budget
      ? `${total > budget.amount ? "🔴 Passou" : "🟢 Dentro"} do teto de ${brl(budget.amount)}${total > budget.amount ? ` em ${brl(total - budget.amount)}` : ` (sobram ${brl(budget.amount - total)})`}`
      : "",
    futureTotal > 0
      ? `📆 Falta pagar nos próximos meses: ${brl(futureTotal)} (até ${MONTH_NAMES[last.date.getMonth()].slice(0, 3)}/${String(last.date.getFullYear()).slice(2)})`
      : "",
  ].filter(Boolean);
  return { text: lines.join("\n"), bars, title: `${label} em ${MONTH_NAMES[m]}/${y}`, prevLabel: MONTH_NAMES[prevDate.getMonth()] };
}

/** "Quanto gasto com assinaturas?": o que se repete todo mês, com o custo no ano. */
export async function buildSubscriptionsResponse(): Promise<string> {
  const today = todayBRT();
  const entries = await prisma.financeEntry.findMany({
    where: {
      type: "expense",
      date: { gte: new Date(today.getFullYear(), today.getMonth(), 1), lte: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59) },
    },
    select: { description: true, category: true, subcategory: true, amount: true },
  });
  const recurring = entries.filter(isRecurring);
  if (recurring.length === 0) return "Não encontrei assinaturas nem contas fixas lançadas neste mês.";

  const subs = recurring.filter((e) => e.category === "Assinaturas").sort((a, b) => b.amount - a.amount);
  const fixed = recurring.filter((e) => e.category !== "Assinaturas").sort((a, b) => b.amount - a.amount);
  const line = (e: (typeof recurring)[number]) => `• ${baseName(e)}: ${brl(e.amount)}/mês · ${brl(e.amount * 12)}/ano`;
  const total = (l: typeof recurring) => l.reduce((s, e) => s + e.amount, 0);

  const parts = [`📌 *Assinaturas e contas fixas de ${MONTH_NAMES[today.getMonth()]}*`];
  if (subs.length) parts.push(`\n*Assinaturas* (${brl(total(subs))}/mês · ${brl(total(subs) * 12)}/ano)`, ...subs.map(line));
  if (fixed.length) parts.push(`\n*Contas fixas* (${brl(total(fixed))}/mês)`, ...fixed.map(line));
  parts.push(`\n💡 Alguma assinatura você não usa? Cancelar uma de ${brl(subs[0]?.amount ?? 0)} libera ${brl((subs[0]?.amount ?? 0) * 12)} no ano.`);
  return parts.join("\n");
}

/**
 * "Por que estourei o mês?": separa o mês em parcelas, contas fixas/assinaturas
 * e gastos do dia a dia, aponta a causa principal e compara as categorias do
 * dia a dia com a média dos 2 meses anteriores (anomalias).
 */
export async function buildMonthDiagnosis(): Promise<string> {
  const today = todayBRT();
  const y = today.getFullYear();
  const m = today.getMonth();
  const range = (mi: number) => ({ gte: new Date(y, mi, 1), lte: new Date(y, mi + 1, 0, 23, 59, 59) });
  const [entries, prevEntries] = await Promise.all([
    prisma.financeEntry.findMany({ where: { date: range(m) }, select: { type: true, amount: true, category: true, subcategory: true, description: true } }),
    prisma.financeEntry.findMany({ where: { type: "expense", date: { gte: new Date(y, m - 2, 1), lte: new Date(y, m, 0, 23, 59, 59) } }, select: { amount: true, category: true, description: true, date: true } }),
  ]);

  const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const expenses = entries.filter((e) => e.type === "expense");
  const installments = expenses.filter((e) => isInstallment(e.description));
  const recurring = expenses.filter((e) => !isInstallment(e.description) && isRecurring(e));
  const daily = expenses.filter((e) => !isInstallment(e.description) && !isRecurring(e));
  const sum = (l: { amount: number }[]) => l.reduce((s, e) => s + e.amount, 0);
  const total = sum(expenses);
  const balance = income - total;

  const buckets = [
    { name: "parcelas no cartão", value: sum(installments), action: "segurar compras parceladas novas até as atuais terminarem" },
    { name: "contas fixas e assinaturas", value: sum(recurring), action: "revisar assinaturas que você não usa" },
    { name: "gastos do dia a dia", value: sum(daily), action: "definir um teto semanal para o dia a dia" },
  ].sort((a, b) => b.value - a.value);
  const main = buckets[0];
  const pct = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(0)}%` : "0%");

  const topInstallments = Object.entries(
    installments.reduce<Record<string, number>>((acc, e) => {
      const k = e.description.replace(/\s*-?\s*Parcela \d+\/\d+.*$/, "").replace(/\s*\(compra em [^)]*\)/, "").trim();
      acc[k] = (acc[k] || 0) + e.amount;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Anomalias: categoria do dia a dia acima de 1,5× a média mensal dos meses
  // anteriores (até 2) e +R$ 100. A média divide só pelos meses que têm algum
  // lançamento — mês vazio (antes de começar a usar o app) não conta como zero.
  const dailyByCat = daily.reduce<Record<string, number>>((acc, e) => ((acc[e.category] = (acc[e.category] || 0) + e.amount), acc), {});
  const prevDaily = prevEntries.filter((e) => !isInstallment(e.description) && !isRecurring({ description: e.description, category: e.category }));
  const monthsWithData = new Set(prevEntries.map((e) => `${e.date.getFullYear()}-${e.date.getMonth()}`)).size;
  // Só compara com média de pelo menos 2 meses: com 1 mês só (ex: o primeiro
  // mês de uso) qualquer gasto normal parecia "fora do normal".
  const prevAvg = monthsWithData < 2 ? {} : prevDaily.reduce<Record<string, number>>((acc, e) => ((acc[e.category] = (acc[e.category] || 0) + e.amount / monthsWithData), acc), {});
  const anomalies = Object.entries(dailyByCat)
    .filter(([cat, v]) => (prevAvg[cat] || 0) > 0 && v > prevAvg[cat] * 1.5 && v - prevAvg[cat] > 100)
    .map(([cat, v]) => `• ${cat}: ${brl(v)} (média ${brl(prevAvg[cat])})`);

  const risk = balance >= 300 ? "baixo" : balance >= 0 ? "médio" : "alto";
  const lines = [
    `🎯 *Diagnóstico de ${MONTH_NAMES[m]}*`,
    `${balance >= 0 ? "🟢" : "🔴"} Entra ${brl(income)} · sai ${brl(total)} · ${balance >= 0 ? "sobra" : "falta"} ${brl(Math.abs(balance))}`,
    `\n*Causa principal:* ${main.name} — ${brl(main.value)} (${pct(main.value)} das saídas)`,
    ...buckets.slice(1).map((b) => `• ${b.name}: ${brl(b.value)} (${pct(b.value)})`),
  ];
  if (main.name === "parcelas no cartão" && topInstallments.length) {
    lines.push(`\n*Parcelas que mais pesam:*`, ...topInstallments.map(([k, v]) => `• ${k}: ${brl(v)}`));
  }
  if (anomalies.length) lines.push(`\n🔍 *Fora do normal:*`, ...anomalies);
  lines.push(`\n*Risco:* ${risk} · *Ação:* ${main.action}.`);
  return lines.join("\n");
}

/**
 * "Quanto tenho no VR?": créditos recebidos − gastos pagos na conta do vale
 * (contas com "VR", "ticket" ou "vale" no nome), e o gasto diário possível
 * até o próximo crédito previsto.
 */
export async function buildVrBalance(): Promise<string> {
  const isVoucher = { OR: ["VR", "ticket", "vale"].map((w) => ({ account: { contains: w, mode: "insensitive" as const } })) };
  const paid = await prisma.financeEntry.findMany({ where: { ...isVoucher, status: "paid" }, select: { type: true, amount: true } });
  if (paid.length === 0) return "🍔 Ainda não tem nada lançado no VR. Quando o crédito cair, me diga \"caiu 715 no VR\".";
  const balance = paid.reduce((s, e) => s + (e.type === "income" ? e.amount : -e.amount), 0);
  const next = await prisma.financeEntry.findFirst({ where: { ...isVoucher, type: "income", status: "pending" }, orderBy: { date: "asc" } });
  const lines = [`🍔 *Saldo do VR:* ${brl(balance)}`];
  if (next) {
    const days = Math.max(1, Math.ceil((next.date.getTime() - todayBRT().getTime()) / 86400000));
    lines.push(`📅 Próximo crédito previsto: ${brl(next.amount)} em ${formatDayMonth(next.date)}`);
    lines.push(`🍽️ Dá pra gastar até ${brl(Math.max(0, balance) / days)} por dia até lá.`);
  }
  return lines.join("\n");
}

export async function vrBalanceShort(): Promise<string> {
  const isVoucher = { OR: ["VR", "ticket", "vale"].map((w) => ({ account: { contains: w, mode: "insensitive" as const } })) };
  const paid = await prisma.financeEntry.findMany({ where: { ...isVoucher, status: "paid" }, select: { type: true, amount: true } });
  if (paid.length === 0) return "";
  const balance = paid.reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), 0);
  const next = await prisma.financeEntry.findFirst({ where: { ...isVoucher, type: "income", status: "pending" }, orderBy: { date: "asc" } });
  const days = next ? Math.max(1, Math.ceil((next.date.getTime() - todayBRT().getTime()) / 86400000)) : 0;
  return `🍔 VR: ${brl(balance)}${next ? ` (${brl(Math.max(0, balance) / days)}/dia até ${formatDayMonth(next.date)})` : ""}`;
}

/**
 * Limite do cartão (pedido dele: "não quero mais passar do meu salário"):
 * o que sobra do salário no mês da fatura aberta — tudo que passar no cartão
 * até o fechamento cai nela. VR fica de fora (comida vai no VR).
 */
export async function cardLimitData() {
  const config = await prisma.agentConfig.findFirst({ select: { creditCardDueDay: true, creditCardBestDay: true } });
  const due = config?.creditCardDueDay || 10, best = config?.creditCardBestDay || 5;
  const today = todayBRT();
  const bill = creditCardBillDate(today, due, best);
  const close = new Date(bill.getFullYear(), bill.getMonth() - (best > due ? 1 : 0), best - 1, 12);
  const days = Math.max(1, Math.round((close.getTime() - today.getTime()) / 86400000) + 1);
  const { done, pending } = await monthForecastParts(bill.getFullYear(), bill.getMonth());
  const left = done + pending;
  const month = MONTH_NAMES[bill.getMonth()];
  const estimate = await prisma.financeEntry.findFirst({
    where: { type: "income", status: "pending", description: { contains: "(previsto)" }, category: "Salário", ...SO_SALARIO, date: { gte: new Date(bill.getFullYear(), bill.getMonth(), 1), lte: new Date(bill.getFullYear(), bill.getMonth() + 1, 0, 23, 59) } },
    select: { id: true },
  });
  const note = estimate ? " (com o salário estimado)" : "";
  // Vales (VR de agora + saldo de vale antigo): comida que não sai do salário.
  const valeEntries = await prisma.financeEntry.findMany({
    where: { status: "paid", OR: ["VR", "ticket", "vale"].map((w) => ({ account: { contains: w, mode: "insensitive" as const } })) },
    select: { account: true, type: true, amount: true },
  });
  const porConta = new Map<string, number>();
  for (const e of valeEntries) porConta.set(e.account, (porConta.get(e.account) ?? 0) + (e.type === "income" ? e.amount : -e.amount));
  const saldo = [...porConta].map(([account, v]) => ({ account, saldo: v })).filter((v) => v.saldo >= 0.01);
  return { left, close, days, month, note, saldo, vales: saldo.reduce((a, v) => a + v.saldo, 0) };
}

export async function cardLimitLine(): Promise<string> {
  const { left, close, days, month, note, saldo, vales } = await cardLimitData();
  const comida = saldo.length
    ? `\n🍔 Para comida, sem mexer no salário: ${brl(vales)}${saldo.length > 1 ? ` (${saldo.map((v) => `${v.account} ${brl(v.saldo)}`).join(" + ")})` : ""} — use primeiro.`
    : "";
  return (left >= 1
    ? `💳 Pode gastar no cartão até ${formatDayMonth(close)}: ${brl(left)} (≈ ${brl(left / days)}/dia) — é o que sobra do salário de ${month}${note}.`
    : `🔴 ${month[0].toUpperCase()}${month.slice(1)} já passou do salário em ${brl(-left)}${note}. Até ${formatDayMonth(close)}, cada compra no cartão aumenta isso — comida, no VR.`) + comida;
}

/**
 * 🏁 Desafio do limite (pedido dele, 22/10/2026): dias seguidos em que o gasto
 * no cartão ficou dentro do que cabe por dia até o fechamento da fatura.
 * Conta de hoje para trás; mostra também o recorde desta fatura.
 */
export async function limitChallengeLine(): Promise<string> {
  const { left, close, days } = await cardLimitData();
  const porDia = Math.max(0, left / days);
  const ini = new Date(close.getFullYear(), close.getMonth() - 1, close.getDate() + 1, 12); // 1º dia desta fatura
  const hoje = todayBRT();
  const compras = await prisma.financeEntry.findMany({
    where: { type: "expense", paymentMethod: "cartão", card: "", purchaseDate: { gte: dayRange(ini).gte, lte: dayRange(hoje).lte }, NOT: [{ description: { contains: "Parcela" } }, { description: { contains: "(previsto)" } }] },
    select: { amount: true, purchaseDate: true },
  });
  const chave = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const porData = new Map<string, number>();
  for (const c of compras) if (c.purchaseDate) porData.set(chave(c.purchaseDate), (porData.get(chave(c.purchaseDate)) ?? 0) + c.amount);
  let atual = 0, recorde = 0, corrida = 0, contandoAtual = true;
  // De hoje para trás: a sequência atual; e o maior trecho desde o início da fatura.
  for (let d = new Date(hoje); d >= ini; d.setDate(d.getDate() - 1)) {
    const dentro = (porData.get(chave(d)) ?? 0) <= porDia + 0.01;
    if (dentro) { corrida++; if (contandoAtual) atual++; } else { recorde = Math.max(recorde, corrida); corrida = 0; contandoAtual = false; }
  }
  recorde = Math.max(recorde, corrida);
  const fechaHoje = hoje.getDate() === close.getDate() && hoje.getMonth() === close.getMonth();
  if (fechaHoje) return left >= 0 ? "🏆 *Fatura fechada sem passar do salário!* Parabéns, segurou firme." : `😬 A fatura fechou ${brl(-left)} acima do salário. Próxima rodada começa amanhã.`;
  const meta = porDia >= 1 ? `até ${brl(porDia)}/dia` : "sem gastar no cartão";
  if (!atual) return `🏁 Desafio: hoje passou do limite. Amanhã recomeça (${meta}). Recorde desta fatura: ${recorde} dia(s).`;
  return `🔥 Desafio: ${atual} dia(s) seguido(s) dentro do limite (${meta})${recorde > atual ? ` · recorde desta fatura: ${recorde}` : " · é o seu recorde nesta fatura!"}`;
}

/** Limite do cartão falado (Alexa): "Você pode gastar 160 reais no cartão até 3 de novembro…". */
export async function cardLimitSpeech(): Promise<string> {
  const { left, close, vales } = await cardLimitData();
  const ate = `${close.getDate()} de ${MESES_FALA[close.getMonth()]}`;
  const base = left >= 1 ? `Você pode gastar ${reaisFala(left)} no cartão até ${ate}.` : `Atenção: o mês da fatura já passou do salário em ${reaisFala(-left)}. Segure o cartão até ${ate}.`;
  return vales >= 1 ? `${base} Para comida, tem ${reaisFala(vales)} nos vales.` : base;
}

/** Resumo do dia (21h): o que gastou hoje, tetos, previsão do mês, VR e o que vence amanhã. */
export async function buildDailyDigest(): Promise<string> {
  const today = todayBRT();
  const { gte, lte } = dayRange(today);
  const spent = await spentBetween(gte, lte);
  const total = spent.reduce((sum, e) => sum + e.amount, 0);
  const lines = [`📋 *Seu dia — ${WEEKDAYS[today.getDay()]}, ${formatDayMonth(today)}*`];
  if (spent.length === 0) {
    lines.push("🙌 Dia sem gastos!");
  } else {
    const items = spent.slice(0, 6).map((e) => `${(e.description.replace(/\s*-?\s*Parcela.*$/, "").trim() || e.subcategory || e.category)} ${brl(e.amount)}`);
    lines.push(`💸 Hoje: ${brl(total)} — ${items.join(" · ")}${spent.length > 6 ? " …" : ""}`);
    const { items: budgets } = await budgetStatus(today.getFullYear(), today.getMonth());
    const touched = budgets.filter((b) => spent.some((e) => e.category === b.category) || b.spent / b.limit >= 0.7);
    if (touched.length) lines.push(`🎯 Tetos: ${touched.map((b) => `${budgetIcon((b.spent / b.limit) * 100)} ${b.category} ${((b.spent / b.limit) * 100).toFixed(0)}%`).join(" · ")}`);
  }
  lines.push((await monthForecastLine(today.getFullYear(), today.getMonth())).trim());
  lines.push(await cardLimitLine());
  lines.push(await limitChallengeLine().catch(() => ""));
  const vr = await vrBalanceShort();
  if (vr) {
    lines.push(vr);
    // Sem gasto no VR há 5 dias: lembra de lançar (senão o saldo do sistema
    // fica maior que o do app e a previsão acha que tem mais comida coberta).
    const lastVrSpend = await prisma.financeEntry.findFirst({
      where: { type: "expense", OR: ["VR", "ticket", "vale"].map((w) => ({ account: { contains: w, mode: "insensitive" as const } })) },
      orderBy: { date: "desc" },
    });
    const fiveDaysAgo = new Date(today.getTime() - 5 * 86400000);
    if (!lastVrSpend || lastVrSpend.date < fiveDaysAgo) {
      lines.push(`💡 Faz uns dias sem gasto no VR por aqui. Usou? Lança assim: "almoço 25 no VR" — e confere se o saldo bate com o app.`);
    }
  }
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
  const due = await dueBetween(dayRange(tomorrow).gte, dayRange(tomorrow).lte);
  lines.push(due.length ? `📅 Amanhã:\n${due.join("\n")}` : "📅 Amanhã: nada vencendo.");
  const scooter = await scooterDigestLine();
  if (scooter) lines.push(scooter);
  const work = await workDigestLine();
  if (work) lines.push(work);
  return lines.join("\n");
}

/**
 * Relatório da semana (domingo): entrou/saiu, onde mais gastou, tetos,
 * previsão/Reserva, o que vence e a agenda da próxima semana e desejos que já
 * cabem — tudo calculado. A IA só escreve um comentário curto no fim,
 * cruzando os gastos com o humor do diário, e só com os dados enviados.
 */
export async function buildWeeklyDigest(providerOpts: ProviderOptions): Promise<{ text: string; weekStart: string; weekEnd: string }> {
  const today = todayBRT();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7), 12);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12);
  const gte = dayRange(monday).gte;
  const lte = dayRange(sunday).lte;
  const spent = await spentBetween(gte, lte);
  const out = spent.reduce((sum, e) => sum + e.amount, 0);
  const incomes = await prisma.financeEntry.findMany({ where: { type: "income", status: "paid", date: { gte, lte } } });
  const income = incomes.reduce((sum, e) => sum + e.amount, 0);
  const byCat = spent.reduce<Record<string, number>>((acc, e) => ((acc[e.category] = (acc[e.category] || 0) + e.amount), acc), {});
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const { items: budgets } = await budgetStatus(today.getFullYear(), today.getMonth());
  const nextMon = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 1, 12);
  const nextSun = new Date(nextMon.getFullYear(), nextMon.getMonth(), nextMon.getDate() + 6, 12);
  const due = await dueBetween(dayRange(nextMon).gte, dayRange(nextSun).lte);
  const wishes = await prisma.wishItem.findMany({ where: { status: "wish" } });
  const fits: string[] = [];
  for (const w of wishes) if ((await checkWish(w)).level === "green") fits.push(w.name);

  const lines = [
    `📊 *Sua semana — ${formatDayMonth(monday)} a ${formatDayMonth(sunday)}*`,
    `💰 Entrou ${brl(income)} · 💸 gastou ${brl(out)}`,
    top.length ? `🏷️ Onde mais gastou: ${top.map(([c, v]) => `${c} ${brl(v)}`).join(" · ")}` : "🙌 Nenhum gasto na semana.",
    budgets.length ? `\n🎯 *Tetos de ${MONTH_NAMES[today.getMonth()]}:*\n${budgets.map((b) => `${budgetIcon((b.spent / b.limit) * 100)} ${b.category}: ${brl(b.spent)} de ${brl(b.limit)}`).join("\n")}` : "",
    `\n${(await monthForecastLine(today.getFullYear(), today.getMonth())).trim()}`,
    due.length ? `\n📅 *Próxima semana:*\n${due.join("\n")}` : "\n📅 Próxima semana: nada vencendo.",
    fits.length ? `\n🛍️ Já cabe da lista de desejos: ${fits.join(", ")}` : "",
  ].filter(Boolean);

  // Trabalho (Central do Atendente): só números, fora do comentário da IA.
  try {
    const work = await workWeekSection(monday);
    if (work) {
      lines.push(work);
      // Comentário curto sobre a semana de trabalho, só com os números acima.
      try {
        const { content } = await generateResponse(
          [{ role: "user", content: work }],
          "Você é a secretária do Renato, atendente do suporte do PJe. Em NO MÁXIMO 2 frases, comente a semana de trabalho dele usando SÓ estes números (resolvidos, Redmine, melhor dia, tipos de erro): um destaque positivo e uma sugestão prática (ex: um tutorial para o erro que mais se repetiu). Não invente números nem fatos. Mantenha os nomes dos tipos de erro exatamente como estão.",
          0.4,
          120,
          providerOpts
        );
        if (content.trim()) lines.push(`💬 ${content.trim()}`);
      } catch {
        // o bloco vale sem o comentário
      }
    }
  } catch (err) {
    console.error("[weekly] trabalho:", err);
  }

  // Comentário curto da IA: só com os números acima + humor do diário.
  try {
    const diaries = await prisma.diaryEntry.findMany({ where: { date: { gte, lte } }, orderBy: { date: "asc" } });
    const facts = [
      `Gastos da semana (dia · categoria · valor): ${spent.slice(0, 20).map((e) => `${WEEKDAYS[(e.purchaseDate ?? e.date).getDay()]} · ${e.category} › ${e.subcategory} · ${brl(e.amount)}`).join("; ") || "nenhum"}`,
      `Humor no diário: ${diaries.map((d) => `${WEEKDAYS[d.date.getDay()]}: ${d.mood || "?"}`).join("; ") || "sem registros"}`,
    ].join("\n");
    const { content } = await generateResponse(
      [{ role: "user", content: facts }],
      "Você é a secretária financeira do Renato. Em NO MÁXIMO 2 frases, faça um comentário amigável sobre a semana: se houver relação entre os dias de mais gasto (principalmente delivery/lanche/bar) e o humor do diário, aponte; senão, dê um incentivo prático para a próxima semana. Use SÓ os dados recebidos, não invente números nem fatos.",
      0.5,
      150,
      providerOpts
    );
    if (content.trim()) lines.push(`\n💬 ${content.trim()}`);
  } catch {
    // o relatório vale sem o comentário
  }
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { text: lines.join("\n"), weekStart: iso(monday), weekEnd: iso(sunday) };
}

export async function monthForecastLine(year: number, monthIndex: number): Promise<string> {
  const { total: f, done, pending, budgetRest } = await monthForecastParts(year, monthIndex);
  const month = MONTH_NAMES[monthIndex];
  if (f >= 300) return `\n📊 Previsão de ${month}: sobra ${brl(f)}.`;
  if (f >= 0) return `\n🟡 Previsão de ${month}: sobra só ${brl(f)} — segura os gastos.`;
  const reserve = await findReserveGoal();
  const agoraR = reserve ? await reserveNow(reserve) : null;
  const hojeBrt = new Date(Date.now() - 3 * 3600_000);
  const mesAtual = hojeBrt.getUTCFullYear() === year && hojeBrt.getUTCMonth() === monthIndex;
  const fromReserve = reserve
    ? mesAtual
      ? ` → já saiu da ${reserve.name} (agora ${brl(agoraR?.agora ?? reserve.currentAmount)})`
      : ` → sai da ${reserve.name} no dia 1º (agora ${brl(agoraR?.agora ?? reserve.currentAmount)})`
    : "";
  // Tudo (ou quase) já pago: não é "falta pagar", é o mês que já fechou no vermelho.
  if (Math.abs(pending) < 1 && done < 0) {
    const extra = budgetRest >= 1 ? ` Se usar o resto dos tetos, mais ${brl(budgetRest)}.` : "";
    return `\n🔴 ${month[0].toUpperCase()}${month.slice(1)}: já saiu ${brl(-done)} a mais do que entrou (tudo pago)${fromReserve}.${extra}`;
  }
  const parts = [
    done < 0 ? `já saiu ${brl(-done)} a mais do que entrou` : done > 0 ? `até agora sobra ${brl(done)}` : "",
    Math.abs(pending) >= 1 ? (pending < 0 ? `faltam pagar ${brl(-pending)}` : `faltam receber ${brl(pending)}`) : "",
    budgetRest >= 1 ? `até ${brl(budgetRest)} pelos tetos` : "",
  ].filter(Boolean);
  return `\n🔴 Previsão de ${month}: fecha em −${brl(-f)} (${parts.join(" · ")})${fromReserve}.`;
}

/** "Como está meu orçamento?": cada teto com 🟢 <70% · 🟡 70–100% · 🔴 estourou. */
export async function buildBudgetResponse(): Promise<string> {
  const today = todayBRT();
  const { items, withoutLimit } = await budgetStatus(today.getFullYear(), today.getMonth());
  if (items.length === 0) return "🎯 Você ainda não tem tetos por categoria. Cadastre no painel (Financeiro › Orçamento) ou me peça uma sugestão.";
  const planned = items.reduce((s, i) => s + i.limit, 0);
  const spent = items.reduce((s, i) => s + i.spent, 0);
  const lines = items.map((i) => {
    const pct = (i.spent / i.limit) * 100;
    const rest = i.limit - i.spent;
    return `${budgetIcon(pct)} ${i.category}: ${brl(i.spent)} de ${brl(i.limit)} (${pct.toFixed(0)}%) · ${rest >= 0 ? `sobram ${brl(rest)}` : `passou ${brl(-rest)}`}`;
  });
  const extra = withoutLimit.length
    ? `\n⚪ Sem teto: ${withoutLimit.map(([c, v]) => `${c} ${brl(v)}`).join(" · ")}`
    : "";
  return `🎯 *Orçamento de ${MONTH_NAMES[today.getMonth()]}*: ${brl(spent)} de ${brl(planned)} (${((spent / planned) * 100).toFixed(0)}%)\n\n${lines.join("\n")}${extra}`;
}

/**
 * Contas a pagar: atrasadas + o que vence até o fim do mês. Compras no cartão
 * viram UMA linha por fatura (senão o dia 10 teria dezenas de linhas).
 * mode "reminder" (lembrete das 9h): só vencidas e as que vencem em até 3
 * dias — devolve "" se não houver nada, para não mandar mensagem à toa.
 */
export async function buildBillsDue(mode: "query" | "reminder" = "query"): Promise<string> {
  const today = todayBRT();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const DAY = 86400000;
  const until = mode === "reminder"
    ? new Date(startToday.getTime() + 4 * DAY - 1)
    : new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
  // Despesas a pagar + estornos no cartão (crédito que abate da fatura).
  const pending = await prisma.financeEntry.findMany({
    where: { status: "pending", date: { lte: until }, OR: [{ type: "expense" }, { type: "income", paymentMethod: "cartão" }] },
    orderBy: { date: "asc" },
  });

  const items: { label: string; amount: number; date: Date }[] = [];
  // Uma linha por cartão: campo "card" vazio = o cartão dele; preenchido =
  // cartão de outra pessoa (ex: "Santander do Bruno") — ele paga cada um à parte.
  const cards = new Map<string, { amount: number; date: Date; count: number; card: string }>();
  for (const e of pending) {
    if (e.paymentMethod === "cartão") {
      const key = `${e.card}|${e.date.toISOString().slice(0, 10)}`;
      const c = cards.get(key) ?? { amount: 0, date: e.date, count: 0, card: e.card };
      if (e.type === "income") {
        c.amount -= e.amount;
      } else {
        c.amount += e.amount;
        c.count++;
      }
      cards.set(key, c);
    } else {
      const name = e.description.replace(/\s*\((previsto|recorrente)\)/gi, "").trim();
      items.push({ label: name || e.subcategory || e.category, amount: e.amount, date: e.date });
    }
  }
  for (const c of cards.values()) {
    const name = c.card ? `Cartão ${c.card}` : "Fatura do cartão";
    items.push({ label: `💳 ${name} (${c.count} ${c.count === 1 ? "compra" : "compras"})`, amount: c.amount, date: c.date });
  }
  items.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (items.length === 0) return mode === "reminder" ? "" : `✅ Nenhuma conta a pagar até o fim de ${MONTH_NAMES[today.getMonth()]}!`;

  const line = (i: (typeof items)[number]) => {
    const day = new Date(i.date.getFullYear(), i.date.getMonth(), i.date.getDate()).getTime();
    const diff = Math.round((day - startToday.getTime()) / DAY);
    const when = diff < 0 ? `venceu ${formatDayMonth(i.date)}!` : diff === 0 ? "vence HOJE" : diff === 1 ? "vence amanhã" : `vence ${formatDayMonth(i.date)}`;
    const icon = diff < 0 ? "🔴" : diff <= 3 ? "🟡" : "⚪";
    return `${icon} ${i.label} — ${brl(i.amount)} (${when})`;
  };
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const title = mode === "reminder" ? "⏰ *Contas vencendo*" : `📋 *Contas a pagar até o fim de ${MONTH_NAMES[today.getMonth()]}*`;
  const footer = mode === "reminder" ? `\nJá pagou? Me diga "paguei o aluguel" que eu dou baixa.` : "";
  return `${title}\n${items.map(line).join("\n")}\n\nTotal: ${brl(total)}${footer}`;
}

export async function buildQueryResponse(intent: PersonalQueryIntent): Promise<string> {
  if (intent === "bills_due") return buildBillsDue("query");
  if (intent === "budget_status") return buildBudgetResponse();
  if (intent === "vr_balance") return buildVrBalance();
  if (intent === "wish_list") return buildWishList();
  if (intent === "subscriptions") return buildSubscriptionsResponse();
  if (intent === "month_diagnosis") return buildMonthDiagnosis();

  if (intent === "month_closing") {
    const today = todayBRT();
    const last = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return buildMonthClosing(last.getFullYear(), last.getMonth());
  }

  if (intent === "pending_today") {
    const items = await prisma.agendaItem.findMany({
      where: { done: false },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    return items.length
      ? `📋 *Pendências:*\n${items.map((i) => `• ${i.title}`).join("\n")}`
      : "✅ Nenhuma pendência no momento!";
  }

  if (intent === "open_tickets") {
    const tickets = await prisma.ticket.findMany({
      where: { status: "open" },
      orderBy: { lastSeen: "desc" },
      take: 10,
    });
    return tickets.length
      ? `🎫 *Chamados abertos:*\n${tickets.map((t) => `• ${t.ticketId} — ${t.groupName}`).join("\n")}`
      : "✅ Nenhum chamado aberto!";
  }

  if (intent === "finance_summary") {
    // Só o mês atual (antes não tinha fim e somava parcelas/salários previstos
    // de todos os meses futuros). Separa o que já saiu do que ainda vai sair.
    const today = todayBRT();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
    const entries = await prisma.financeEntry.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } });
    const sum = (type: string, status?: string) =>
      entries.filter((e) => e.type === type && (!status || e.status === status)).reduce((s, e) => s + e.amount, 0);
    const income = sum("income");
    const expense = sum("expense");
    const balance = income - expense;
    const monthName = today.toLocaleDateString("pt-BR", { month: "long" });
    return `💰 *Financeiro de ${monthName}:*\nEntradas: ${brl(income)} (já recebido ${brl(sum("income", "paid"))})\nSaídas: ${brl(expense)} (já pago ${brl(sum("expense", "paid"))} · a pagar ${brl(sum("expense", "pending"))})\n${balance >= 0 ? "🟢" : "🔴"} Fecha o mês com ${brl(balance)}`;
  }

  if (intent === "savings_summary") {
    const goals = await prisma.savingsGoal.findMany({ orderBy: { createdAt: "asc" } });
    if (goals.length === 0) return "Nenhuma meta de economia encontrada.";
    const lines = goals.map((g) => {
      const pct = (g.currentAmount / g.targetAmount) * 100;
      if (g.currentAmount >= g.targetAmount) return `• 🏆 ${g.name}: ${brl(g.targetAmount)} — *Conquistada!*`;
      const need = goalMonthlyNeed(g);
      return `• ${g.name}: ${brl(g.currentAmount)} de ${brl(g.targetAmount)} (${pct.toFixed(0)}%)${need ? ` · guardar ${brl(need.perMonth)}/mês até ${need.until}` : ""}`;
    });
    return `🎯 *Metas de Economia:*\n${lines.join("\n")}${await goalsViabilityLine(goals)}`;
  }

  const summary = await prisma.dailySummary.findFirst({ orderBy: { createdAt: "desc" } });
  return summary ? summary.summary : "Nenhum resumo de grupo disponível ainda.";
}

/**
 * Check-up do salário (pedido dele: "fica atento quando receber meu salário"):
 * com o valor REAL, como fica o mês na conta corrente (VR fora), quanto ainda
 * cabe no cartão e se os meses seguintes ainda estão com o salário estimado.
 */
export async function salaryCheckup(received: number, previsto: number, when: Date): Promise<string> {
  const y = when.getFullYear(), m = when.getMonth();
  const month = MONTH_NAMES[m];
  const { done, pending } = await monthForecastParts(y, m);
  const saldo = done + pending;
  const lines = [`\n\n📊 *Check-up do salário de ${month}*`];
  if (Math.abs(received - previsto) > 0.01) lines.push(`${received < previsto ? "🔻" : "🔺"} Veio ${brl(Math.abs(received - previsto))} ${received < previsto ? "a menos" : "a mais"} que o estimado.`);
  lines.push(
    saldo >= 0
      ? `${saldo >= 300 ? "🟢" : "🟡"} Pagando tudo o que já está lançado em ${month} (fatura, aluguel, contas), sobram *${brl(saldo)}*.`
      : `🔴 Pagando tudo o que já está lançado em ${month}, faltam *${brl(-saldo)}* — sai da Reserva no dia 1º se nada mudar.`
  );
  lines.push(await cardLimitLine());
  const futuros = await prisma.financeEntry.findMany({
    where: { type: "income", category: "Salário", ...SO_SALARIO, status: "pending", description: { contains: "(previsto)" }, date: { gt: new Date(y, m + 1, 0, 23, 59) } },
    select: { amount: true },
  });
  const estimado = futuros.find((f) => Math.abs(f.amount - received) > 0.01);
  if (estimado) lines.push(`📅 Os próximos meses ainda estão com o salário estimado (${brl(estimado.amount)}). Se ${brl(received)} é o novo normal, ${SALARY_REPLY_MARK} que eu troco em ${futuros.length} mês(es).`);
  return lines.join("\n");
}

/**
 * Frase curta para a Alexa: contas vencidas, que vencem hoje ou amanhã (a
 * fatura de cada cartão numa frase). "" = nada para falar.
 */
export async function billsDueSpeech(): Promise<string> {
  const today = todayBRT();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const DAY = 86400000;
  const pending = await prisma.financeEntry.findMany({
    where: { status: "pending", date: { lte: new Date(start.getTime() + 2 * DAY - 1) }, OR: [{ type: "expense" }, { type: "income", paymentMethod: "cartão" }] },
    orderBy: { date: "asc" },
  });
  const grupos = new Map<string, { nome: string; valor: number; dia: number }>();
  for (const e of pending) {
    const dia = Math.floor((new Date(e.date.getFullYear(), e.date.getMonth(), e.date.getDate()).getTime() - start.getTime()) / DAY);
    const nome = e.paymentMethod === "cartão" ? `a fatura do cartão${e.card ? ` ${e.card}` : ""}` : `${e.description.replace(/\s*\((previsto|recorrente)\)/gi, "").replace(/\s*-\s*Parcela.*$/i, "").trim() || e.category}`;
    const k = `${nome}|${dia}`;
    const g = grupos.get(k) ?? { nome, valor: 0, dia };
    g.valor += e.type === "income" ? -e.amount : e.amount;
    grupos.set(k, g);
  }
  const itens = [...grupos.values()].filter((g) => g.valor > 0.5).slice(0, 3);
  if (!itens.length) return "";
  const quando = (d: number) => (d < 0 ? "está vencida" : d === 0 ? "vence hoje" : "vence amanhã");
  const frases = itens.map((g) => `${g.nome}, de ${Math.round(g.valor)} reais, ${quando(g.dia)}`);
  return `Renato, lembrete de contas: ${frases.join("; ")}.`;
}
