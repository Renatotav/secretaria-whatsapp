// Simulador "e se?" / "posso comprar?": refaz a previsão dos próximos meses com
// a mudança pedida (salário, compra, parcela). Saiu de message-handlers.ts (28/10/2026) —
// sem estado de conversa.

import { prisma } from "./prisma";
import { type PersonalRouteResult } from "./personal-router";
import { todayBRT, creditCardBillDate } from "./dates";
import type { AgentConfig } from "@prisma/client";
import { brlMsg as brl } from "./format";
import { budgetStatus, formatDayMonth, MONTH_NAMES, monthTotals } from "./finance-common";
import { findReserveGoal, reserveNow } from "./finance-goals";

export const signed = (v: number) => `${v >= 0 ? "+" : "−"}${brl(Math.abs(v))}`;

/**
 * "E se meu salário for X?" / "Posso comprar Y em Nx?": recalcula o mês atual
 * e os próximos 3 com o que já está lançado, trocando a renda pela hipotética
 * e/ou somando a compra (no cartão, nas faturas certas). Não grava nada.
 */
export async function simulateFinance(
  route: Extract<PersonalRouteResult, { simDescription: string }>,
  config: AgentConfig
): Promise<string> {
  const MONTHS = 4;
  const today = todayBRT();
  const purchaseTotal = route.simPurchaseAmount && route.simPurchaseAmount > 0 ? route.simPurchaseAmount : 0;
  const what = route.simDescription ? route.simDescription.charAt(0).toUpperCase() + route.simDescription.slice(1) : "Compra";

  // No VR: o que importa é o saldo do vale até o próximo crédito.
  if (route.simPaymentMethod === "ticket" && purchaseTotal > 0) {
    const isVoucher = { OR: ["VR", "ticket", "vale"].map((w) => ({ account: { contains: w, mode: "insensitive" as const } })) };
    const paid = await prisma.financeEntry.findMany({ where: { ...isVoucher, status: "paid" }, select: { type: true, amount: true } });
    const balance = paid.reduce((sum, e) => sum + (e.type === "income" ? e.amount : -e.amount), 0);
    const next = await prisma.financeEntry.findFirst({ where: { ...isVoucher, type: "income", status: "pending" }, orderBy: { date: "asc" } });
    const days = next ? Math.max(1, Math.ceil((next.date.getTime() - today.getTime()) / 86400000)) : 30;
    const after = balance - purchaseTotal;
    return [
      `🍔 *${what} de ${brl(purchaseTotal)} no VR*`,
      `Saldo do VR: ${brl(balance)} → depois: ${brl(after)}`,
      after < 0
        ? `❌ *Não dá:* faltam ${brl(-after)} no VR.`
        : `${after / days < 20 ? "⚠️ *Dá, mas aperta:*" : "✅ *Dá.*"} Sobram ${brl(after / days)} por dia até o próximo crédito${next ? ` (${formatDayMonth(next.date)})` : ""}.`,
    ].join("\n");
  }

  const installments = route.simPaymentMethod === "cartão" ? Math.max(1, Math.round(route.simInstallments || 1)) : 1;
  const installmentValue = purchaseTotal / installments;
  const firstBill = route.simPaymentMethod === "cartão"
    ? creditCardBillDate(today, config.creditCardDueDay || 10, config.creditCardBestDay || 5)
    : today;
  const firstKey = firstBill.getFullYear() * 12 + firstBill.getMonth();

  // Cada mês: entra − sai já lançado − o que ainda deve sair dentro dos tetos
  // (mercado, Uber... que ainda não foram gastos). Sem isso, no começo do mês
  // tudo "cabia".
  const lines: string[] = [];
  let worstBefore = Infinity;
  let worstAfter = Infinity;
  let worstMonth = "";
  for (let i = 0; i < MONTHS; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const t = await monthTotals(d.getFullYear(), d.getMonth());
    const { items } = await budgetStatus(d.getFullYear(), d.getMonth());
    const stillPlanned = items.reduce((sum, b) => sum + Math.max(0, b.limit - b.spent), 0);
    const income = route.simIncome && route.simIncome > 0 ? route.simIncome : t.income;
    const key = d.getFullYear() * 12 + d.getMonth();
    const extra = purchaseTotal > 0 && key >= firstKey && key < firstKey + installments ? installmentValue : 0;
    const before = income - t.expense - stillPlanned;
    const after = before - extra;
    if (before < worstBefore) worstBefore = before;
    if (after < worstAfter) { worstAfter = after; worstMonth = MONTH_NAMES[d.getMonth()]; }
    const icon = after < 0 ? "🔴" : after < 300 ? "🟡" : "🟢";
    lines.push(`${icon} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}: ${signed(after)}${extra ? ` (com a parcela de ${brl(extra)})` : ""}`);
  }

  // Teto da categoria no mês em que a compra cai.
  let budgetLine = "";
  let burstsBudget = false;
  if (purchaseTotal > 0 && route.simCategory) {
    const { items } = await budgetStatus(firstBill.getFullYear(), firstBill.getMonth());
    const b = items.find((x) => x.category.toLowerCase() === route.simCategory.toLowerCase());
    if (b) {
      const afterSpent = b.spent + installmentValue;
      burstsBudget = afterSpent > b.limit;
      budgetLine = `${burstsBudget ? "🔴" : afterSpent / b.limit >= 0.7 ? "🟡" : "🟢"} Teto de ${b.category} em ${MONTH_NAMES[firstBill.getMonth()]}: ${brl(b.spent)} → ${brl(afterSpent)} de ${brl(b.limit)}${burstsBudget ? ` (passa ${brl(afterSpent - b.limit)})` : ""}`;
    }
  }

  const reserve = await findReserveGoal();
  const header: string[] = [];
  if (purchaseTotal > 0) {
    header.push(`🤔 *${what} de ${brl(purchaseTotal)}*${installments > 1 ? ` em ${installments}× de ${brl(installmentValue)}` : ""} (${route.simPaymentMethod})`);
  }
  if (route.simIncome && route.simIncome > 0) header.push(`💼 Renda de ${brl(route.simIncome)} por mês`);
  header.push("Como ficariam os meses (entra − sai, já contando o dia a dia que ainda vem pelos tetos):");

  let verdict = "";
  if (purchaseTotal > 0) {
    const fromReserve = worstAfter < 0 && reserve ? ` Isso sairia da ${reserve.name} (agora ${brl((await reserveNow(reserve))?.agora ?? reserve.currentAmount)}).` : "";
    if (worstBefore < 0 && worstAfter < 0) verdict = `❌ *Melhor não:* ${worstMonth} já fecha no vermelho mesmo sem essa compra.${fromReserve}`;
    else if (worstAfter < 0) verdict = `❌ *Não recomendo agora:* ${worstMonth} fica ${brl(Math.abs(worstAfter))} no vermelho por causa dessa compra.${fromReserve}`;
    else if (burstsBudget) verdict = "⚠️ *Cabe no mês, mas estoura o teto da categoria.* Se for necessário, compensa cortando em outra.";
    else if (worstAfter < 300) verdict = `⚠️ *Cabe, mas aperta* ${worstMonth} (sobra só ${brl(worstAfter)}). Se der, espere um mês.`;
    else verdict = "✅ *Cabe.* Nenhum mês fica apertado e o teto aguenta.";
  }

  return [...header, ...lines, budgetLine, verdict, "\n_Simulação — não lancei nada._"]
    .filter(Boolean)
    .join("\n");
}
