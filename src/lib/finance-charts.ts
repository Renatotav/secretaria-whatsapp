// Gráficos do financeiro mandados como imagem no WhatsApp (entradas x saídas,
// gastos do mês por categoria, tetos). Saiu de message-handlers.ts (28/10/2026) —
// sem estado de conversa.

import { sendWhatsAppImage } from "./evolution";
import { barChartPng, progressChartPng } from "./chart";
import { todayBRT } from "./dates";
import type { AgentConfig } from "@prisma/client";
import { brlMsg as brl } from "./format";
import { MONTH_NAMES, budgetStatus, monthTotals } from "./finance-common";
import { getEvoConfig } from "./evolution-config";
import { prisma } from "./prisma";
import { buildCategorySummary } from "./finance-reports";

/**
 * Manda o gráfico de gastos por categoria de um mês (com a marca do mês
 * anterior). Falha só é logada — o texto já foi enviado antes.
 */
export async function sendMonthChart(config: AgentConfig, year: number, monthIndex: number): Promise<void> {
  if (!config.ownerPhone || !config.evolutionUrl) return;
  try {
    const cur = await monthTotals(year, monthIndex);
    const prevDate = new Date(year, monthIndex - 1, 1);
    const prev = await monthTotals(prevDate.getFullYear(), prevDate.getMonth());
    const bars = Object.entries(cur.byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, compare: prev.byCategory[label] }));
    if (bars.length === 0) return;
    const png = await barChartPng(
      `Gastos de ${MONTH_NAMES[monthIndex]}/${year}`,
      `Entrou ${brl(cur.income)} · saiu ${brl(cur.expense)}`,
      bars,
      `marca escura = ${MONTH_NAMES[prevDate.getMonth()]}`
    );
    const evo = getEvoConfig(config);
    await sendWhatsAppImage(evo.evolutionUrl, evo.evolutionApiKey, evo.instanceId, config.ownerPhone, png.toString("base64"), `📊 Gastos por categoria — ${MONTH_NAMES[monthIndex]}`);
  } catch (err) {
    console.error("[chart] falha ao gerar/enviar gráfico", err);
  }
}

/** Entradas x saídas dos últimos 6 meses (barra = saiu, marca escura = entrou). */
export async function sendIncomeExpenseChart(config: AgentConfig): Promise<void> {
  if (!config.ownerPhone || !config.evolutionUrl) return;
  try {
    const today = todayBRT();
    const bars = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const t = await monthTotals(d.getFullYear(), d.getMonth());
      bars.push({
        label: `${MONTH_NAMES[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`,
        value: t.expense,
        compare: t.income,
        // Vermelho = saiu mais do que entrou; verde = sobrou.
        color: t.expense > t.income ? "#e5606a" : "#2fb380",
        valueLabel: `saiu ${brl(t.expense)} · entrou ${brl(t.income)}`,
      });
    }
    const png = await barChartPng("Entradas x saídas", "Últimos 6 meses · barra = saiu · verde = sobrou, vermelho = faltou", bars, "marca escura = quanto entrou");
    const evo = getEvoConfig(config);
    await sendWhatsAppImage(evo.evolutionUrl, evo.evolutionApiKey, evo.instanceId, config.ownerPhone, png.toString("base64"), "📊 Entradas x saídas — últimos 6 meses");
  } catch (err) {
    console.error("[chart] falha ao gerar/enviar gráfico de entradas x saídas", err);
  }
}

/** Gráfico do orçamento: barra = gasto (verde/amarelo/vermelho), marca = teto. */
export async function sendBudgetChart(config: AgentConfig): Promise<void> {
  if (!config.ownerPhone || !config.evolutionUrl) return;
  try {
    const today = todayBRT();
    const { items } = await budgetStatus(today.getFullYear(), today.getMonth());
    if (items.length === 0) return;
    const bars = items.map((i) => {
      const pct = (i.spent / i.limit) * 100;
      return { label: i.category, value: i.spent, compare: i.limit, color: pct >= 100 ? "#e5606a" : pct >= 70 ? "#f2a541" : "#2fb380", valueLabel: `${brl(i.spent)} · ${pct.toFixed(0)}%` };
    });
    const png = await barChartPng(`Orçamento de ${MONTH_NAMES[today.getMonth()]}`, "barra = gasto · marca escura = teto", bars, "verde < 70% · amarelo 70–100% · vermelho estourou");
    const evo = getEvoConfig(config);
    await sendWhatsAppImage(evo.evolutionUrl, evo.evolutionApiKey, evo.instanceId, config.ownerPhone, png.toString("base64"), `🎯 Orçamento — ${MONTH_NAMES[today.getMonth()]}`);
  } catch (err) {
    console.error("[chart] falha ao gerar/enviar gráfico do orçamento", err);
  }
}

/** Imagem com o progresso de cada meta (enviada junto com "como estão minhas metas?"). */
export async function sendGoalsChart(config: AgentConfig): Promise<void> {
  if (!config.ownerPhone || !config.evolutionUrl) return;
  try {
    const goals = await prisma.savingsGoal.findMany({ orderBy: { createdAt: "asc" } });
    if (goals.length === 0) return;
    const png = await progressChartPng(
      "Minhas metas",
      goals.map((g) => ({ label: g.name, current: g.currentAmount, target: g.targetAmount, color: g.color }))
    );
    const evo = getEvoConfig(config);
    await sendWhatsAppImage(evo.evolutionUrl, evo.evolutionApiKey, evo.instanceId, config.ownerPhone, png.toString("base64"), "🎯 Suas metas");
  } catch (err) {
    console.error("[chart] falha ao gerar/enviar gráfico de metas", err);
  }
}

/** Gráfico por subcategoria de "como está meu gasto com X?". */
export async function sendCategoryChart(config: AgentConfig, summary: Awaited<ReturnType<typeof buildCategorySummary>>): Promise<void> {
  if (!config.ownerPhone || !config.evolutionUrl || summary.bars.length === 0) return;
  try {
    const total = summary.bars.reduce((s, b) => s + b.value, 0);
    const png = await barChartPng(summary.title, `Total ${brl(total)}`, summary.bars, `marca escura = ${summary.prevLabel}`);
    const evo = getEvoConfig(config);
    await sendWhatsAppImage(evo.evolutionUrl, evo.evolutionApiKey, evo.instanceId, config.ownerPhone, png.toString("base64"), `📊 ${summary.title}`);
  } catch (err) {
    console.error("[chart] falha ao gerar/enviar gráfico da categoria", err);
  }
}
