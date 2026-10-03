import { prisma } from "./prisma";
import { sendTextWithTyping, sendWhatsAppImage, getBase64FromMediaMessage, fetchGroupInfo, findContact } from "./evolution";
import { barChartPng, progressChartPng } from "./chart";
import { transcribeAudio, generateResponse, type ProviderOptions } from "./openai";
import { analyzePrivateMessage } from "./analyzer";
import { classifyGroupMessage } from "./classifier";
import {
  routePersonalMessage,
  parseStatementEntries,
  parseStatementImage,
  parseInvoiceImage,
  type PersonalQueryIntent,
  type PersonalRouteResult,
  type StatementEntry,
} from "./personal-router";
import { extractAndSaveTickets } from "./ticket-extractor";
import { parseLocalDate, todayBRT, creditCardBillDate } from "./dates";
import type { AgentConfig } from "@prisma/client";

export function extractText(message: Record<string, unknown>): string {
  return (
    (message.conversation as string) ??
    (message.extendedTextMessage as Record<string, string>)?.text ??
    (message.imageMessage as Record<string, string>)?.caption ??
    ""
  );
}

export function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  let h = d.getUTCHours() - 3;
  if (h < 0) h += 24;
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${m}`;
}

function getProviderOpts(config: AgentConfig): ProviderOptions {
  return {
    aiProvider: config.aiProvider,
    openaiApiKey: config.openaiApiKey,
    openaiModel: config.openaiModel,
    groqApiKey: config.groqApiKey,
    groqModel: config.groqModel,
    googleApiKey: config.googleApiKey,
    googleModel: config.googleModel,
    openrouterApiKey: config.openrouterApiKey,
    openrouterModel: config.openrouterModel,
  };
}

async function resolveMentions(text: string, evoUrl: string, evoKey: string, instanceId: string): Promise<string> {
  const mentionRegex = /@(\d{10,15})/g;
  const matches = [...text.matchAll(mentionRegex)];
  const uniqueNumbers = [...new Set(matches.map((m) => m[1]))];

  let resolvedText = text;
  for (const num of uniqueNumbers) {
    const jid = `${num}@s.whatsapp.net`;
    const contact = await findContact(evoUrl, evoKey, instanceId, jid);
    if (contact && (contact.name || contact.pushName)) {
      const name = contact.name || contact.pushName;
      resolvedText = resolvedText.replace(new RegExp(`@${num}`, "g"), `@${name}`);
    }
  }
  return resolvedText;
}

function getEvoConfig(config: AgentConfig) {
  return {
    evolutionUrl: config.evolutionUrl,
    evolutionApiKey: config.evolutionApiKey,
    instanceId: config.instanceId,
  };
}

export async function notifyOwner(config: AgentConfig, text: string): Promise<void> {
  if (!config.ownerPhone || !config.evolutionUrl) return;
  const evo = getEvoConfig(config);
  await sendTextWithTyping(
    evo.evolutionUrl,
    evo.evolutionApiKey,
    evo.instanceId,
    config.ownerPhone,
    text,
    config.typingMsPerChar,
    config.typingMaxSeconds
  );
}

/**
 * Transcreve um áudio recebido via webhook. Tenta usar o base64 já embutido
 * no payload (webhookBase64 habilitado na Evolution); se não vier, cai no
 * fallback de baixar via getBase64FromMediaMessage.
 */
export async function transcribeIncomingAudio(
  evo: { evolutionUrl: string; evolutionApiKey: string; instanceId: string },
  messageId: string,
  message: Record<string, unknown>,
  providerOpts: ProviderOptions
): Promise<string> {
  const audioMessage = (message.audioMessage as Record<string, unknown>) ?? {};
  let base64 = (message.base64 as string) || (audioMessage.base64 as string) || "";
  let mimetype = (audioMessage.mimetype as string) || "audio/ogg";

  if (!base64) {
    const media = await getBase64FromMediaMessage(
      evo.evolutionUrl,
      evo.evolutionApiKey,
      evo.instanceId,
      messageId
    );
    base64 = media.base64;
    mimetype = media.mimetype || mimetype;
  }

  if (!base64) return "";

  const format = mimetype.includes("ogg") ? "ogg" : mimetype.split("/")[1]?.split(";")[0] || "ogg";
  return transcribeAudio(base64, format, providerOpts);
}

/**
 * Baixa o base64 de um documento (ex: PDF) recebido via webhook, com o
 * mesmo esquema de fallback usado para áudio.
 */
export async function downloadIncomingMedia(
  evo: { evolutionUrl: string; evolutionApiKey: string; instanceId: string },
  messageId: string,
  message: Record<string, unknown>,
  field: "documentMessage" | "imageMessage",
  defaultMimetype: string
): Promise<{ base64: string; mimetype: string }> {
  const mediaMessage = (message[field] as Record<string, unknown>) ?? {};
  let base64 = (message.base64 as string) || (mediaMessage.base64 as string) || "";
  let mimetype = (mediaMessage.mimetype as string) || defaultMimetype;

  if (!base64) {
    const media = await getBase64FromMediaMessage(
      evo.evolutionUrl,
      evo.evolutionApiKey,
      evo.instanceId,
      messageId
    );
    base64 = media.base64;
    mimetype = media.mimetype || mimetype;
  }

  return { base64, mimetype };
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${brl(Math.abs(v))}`;

/** Entradas, saídas e saídas por categoria de um mês (pelo `date`, que é o mês em que o dinheiro entra/sai). */
async function monthTotals(year: number, monthIndex: number) {
  const entries = await prisma.financeEntry.findMany({
    where: { date: { gte: new Date(year, monthIndex, 1), lte: new Date(year, monthIndex + 1, 0, 23, 59, 59) } },
    select: { type: true, amount: true, category: true },
  });
  const byCategory: Record<string, number> = {};
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (e.type === "income") income += e.amount;
    else {
      expense += e.amount;
      byCategory[e.category || "Outros"] = (byCategory[e.category || "Outros"] || 0) + e.amount;
    }
  }
  return { income, expense, byCategory };
}

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
    const balance = cur.income - cur.expense;
    const png = await barChartPng(
      `Gastos de ${MONTH_NAMES[monthIndex]}/${year}`,
      `Saiu ${brl(cur.expense)} · ${balance >= 0 ? "sobra" : "faltam"} ${brl(Math.abs(balance))}`,
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
async function sendIncomeExpenseChart(config: AgentConfig): Promise<void> {
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

/**
 * Gastos de uma categoria no mês (ou só de uma subcategoria, se ele perguntou
 * por "luz", "mercado"...): já pago x a pagar, mês anterior e o teto do
 * orçamento. Devolve o texto e as barras por subcategoria para o gráfico.
 */
async function categoryMonth(name: string, year: number, monthIndex: number) {
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

async function buildCategorySummary(name: string | undefined) {
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

  const diff = total - prevTotal;
  const lines = [
    `📂 *${label} em ${MONTH_NAMES[m]}*`,
    `Total: ${brl(total)} (já pago ${brl(paid)} · a pagar ${brl(total - paid)})`,
    prevTotal > 0
      ? `${diff > 0 ? "🔺" : diff < 0 ? "🔻" : "➖"} ${MONTH_NAMES[prevDate.getMonth()]}: ${brl(prevTotal)} (${diff >= 0 ? "+" : "−"}${brl(Math.abs(diff))})`
      : "",
    budget
      ? `${total > budget.amount ? "🔴 Passou" : "🟢 Dentro"} do teto de ${brl(budget.amount)}${total > budget.amount ? ` em ${brl(total - budget.amount)}` : ` (sobram ${brl(budget.amount - total)})`}`
      : "",
  ].filter(Boolean);
  return { text: lines.join("\n"), bars, title: `${label} em ${MONTH_NAMES[m]}/${y}`, prevLabel: MONTH_NAMES[prevDate.getMonth()] };
}

/** Gráfico por subcategoria de "como está meu gasto com X?". */
async function sendCategoryChart(config: AgentConfig, summary: Awaited<ReturnType<typeof buildCategorySummary>>): Promise<void> {
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

/**
 * "E se meu salário for X?" / "Posso comprar Y em Nx?": recalcula o mês atual
 * e os próximos 3 com o que já está lançado, trocando a renda pela hipotética
 * e/ou somando a compra (no cartão, nas faturas certas). Não grava nada.
 */
async function simulateFinance(
  route: Extract<PersonalRouteResult, { type: "finance_simulation" }>,
  config: AgentConfig
): Promise<string> {
  const MONTHS = 4;
  const today = todayBRT();
  const purchaseTotal = route.simPurchaseAmount && route.simPurchaseAmount > 0 ? route.simPurchaseAmount : 0;
  const installments = route.simPaymentMethod === "cartão" ? Math.max(1, Math.round(route.simInstallments || 1)) : 1;
  const installmentValue = purchaseTotal / installments;
  const firstBill = route.simPaymentMethod === "cartão"
    ? creditCardBillDate(today, config.creditCardDueDay || 10, config.creditCardBestDay || 5)
    : today;
  const firstKey = firstBill.getFullYear() * 12 + firstBill.getMonth();

  const lines: string[] = [];
  let worstBefore = Infinity;
  let worstAfter = Infinity;
  let worstMonth = "";
  for (let i = 0; i < MONTHS; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const t = await monthTotals(d.getFullYear(), d.getMonth());
    const income = route.simIncome && route.simIncome > 0 ? route.simIncome : t.income;
    const key = d.getFullYear() * 12 + d.getMonth();
    const extra = purchaseTotal > 0 && key >= firstKey && key < firstKey + installments ? installmentValue : 0;
    const before = income - t.expense;
    const after = before - extra;
    if (before < worstBefore) worstBefore = before;
    if (after < worstAfter) { worstAfter = after; worstMonth = MONTH_NAMES[d.getMonth()]; }
    const icon = after < 0 ? "🔴" : after < 300 ? "🟡" : "🟢";
    lines.push(`${icon} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}: ${signed(after)}${extra ? ` (com a parcela de ${brl(extra)})` : ""}`);
  }

  const header: string[] = [];
  if (purchaseTotal > 0) {
    header.push(`🤔 *${route.simDescription ? route.simDescription.charAt(0).toUpperCase() + route.simDescription.slice(1) : "Compra"} de ${brl(purchaseTotal)}*${installments > 1 ? ` em ${installments}× de ${brl(installmentValue)}` : ""} (${route.simPaymentMethod})`);
  }
  if (route.simIncome && route.simIncome > 0) header.push(`💼 Renda de ${brl(route.simIncome)} por mês`);
  header.push("Como ficariam os meses (entra − sai, com o que já está lançado):");

  let verdict = "";
  if (purchaseTotal > 0) {
    if (worstAfter >= 300) verdict = "✅ *Cabe.* Nenhum mês fica apertado.";
    else if (worstAfter >= 0) verdict = `⚠️ *Cabe, mas aperta* ${worstMonth} (sobra só ${brl(worstAfter)}). Se der, espere um mês.`;
    else if (worstBefore >= 0) verdict = `❌ *Não recomendo agora:* ${worstMonth} fica ${brl(Math.abs(worstAfter))} no vermelho por causa dessa compra.`;
    else verdict = `❌ *Melhor não:* o mês de ${worstMonth} já está no vermelho mesmo sem essa compra.`;
  }

  return [...header, ...lines, verdict, "\n_Simulação — não lancei nada. Gastos do dia a dia ainda não lançados não entram na conta._"]
    .filter(Boolean)
    .join("\n");
}

const isInstallment = (d: string) => /Parcela \d+\/\d+/.test(d);
const isRecurring = (e: { description: string; category: string }) =>
  e.category === "Assinaturas" || (/\((previsto|recorrente)\)/i.test(e.description) && !isInstallment(e.description));
const baseName = (e: { description: string; category: string; subcategory: string }) =>
  e.description.replace(/\s*\((previsto|recorrente)\)/gi, "").trim() || e.subcategory || e.category;

/** "Quanto gasto com assinaturas?": o que se repete todo mês, com o custo no ano. */
async function buildSubscriptionsResponse(): Promise<string> {
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
async function buildMonthDiagnosis(): Promise<string> {
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
  const prevAvg = monthsWithData === 0 ? {} : prevDaily.reduce<Record<string, number>>((acc, e) => ((acc[e.category] = (acc[e.category] || 0) + e.amount / monthsWithData), acc), {});
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
 * Pergunta livre sobre o financeiro: a IA escreve um SELECT, que roda numa
 * transação SOMENTE LEITURA com tempo limite, e depois resume o resultado.
 * Só tabelas do financeiro; qualquer coisa que não seja um SELECT único é recusada.
 */
async function answerFinanceQuestion(question: string, providerOpts: ProviderOptions): Promise<string> {
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
Use ILIKE para buscar texto em description/category. Limite a 50 linhas.
Se a pergunta NÃO disser o período, considere só o mês atual (date dentro do mês de hoje). Nunca some meses futuros
(lançamentos projetados) a menos que a pergunta peça explicitamente o futuro ("quanto falta pagar", "até o fim do ano"...). Responda APENAS com o SQL, sem markdown e sem explicação.`;

  let sql = "";
  try {
    const { content } = await generateResponse([{ role: "user", content: sqlPrompt }], "Você escreve SQL PostgreSQL correto e seguro.", 0, 400, providerOpts);
    sql = content.replace(/```sql|```/gi, "").trim().replace(/;\s*$/, "");
  } catch {
    return "⚠️ Não consegui pensar na consulta agora. Tenta perguntar de outro jeito?";
  }

  const forbidden = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|vacuum|call|do|execute|set|reset|lock|listen|notify|pg_sleep)\b|;|\bpg_|"(AgentConfig|Conversation|Message|GroupMessage|GroupConfig)"/i;
  if (!/^\s*(select|with)\b/i.test(sql) || forbidden.test(sql)) {
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
const ASSISTANT_MANUAL = `💸 Lançar gasto ou receita (texto ou áudio): "gastei 45 no mercado", "recebi 3000 de salário", "comprei um celular de 291 em 17x".
  Depois do gasto ela pergunta o meio de pagamento: responder "2" pix, "3" débito, "4" dinheiro. Para mudar a data da compra, responder só o dia ("15/08").
🧾 Foto de nota fiscal de mercado: lança o gasto, guarda cada item e avisa se algum produto ficou mais caro.
💳 Print ou PDF de fatura/extrato: importa todos os lançamentos de uma vez (se a fatura tiver mais de um cartão — titular e adicionais — ela pergunta quais importar: número, nome ou "tudo"). PDF com senha: ela pede a senha e ele responde só com ela.
📊 "Quanto gastei esse mês?" — entradas, saídas e quanto sobra no mês.
📂 "Como está meu gasto com moradia?" (ou mercado, luz, transporte...) — total da categoria no mês, comparação com o mês passado e gráfico.
🎯 "Por que estourei o mês?" / "Como está meu mês?" — diagnóstico com a causa principal e gráfico por categoria.
📅 "Fechamento do mês" — como fechou o mês passado, com gráfico.
📈 Gráfico quando pedir: "gráfico dos gastos" (mês por categoria), "gráfico de entradas e saídas" (6 meses), "gráfico do mercado" (uma categoria), "gráfico das metas".
↩️ Corrigir o último lançamento: "desfazer" apaga; "na verdade foi 250" troca o valor. Gasto sem valor ("gastei com uber"): ela pergunta quanto foi.
🔁 "Quanto gasto com assinaturas?" — contas fixas e assinaturas.
❓ Pergunta livre sobre os números: "quanto gastei com Uber em setembro?", "qual minha maior compra no cartão?", "quanto falta pagar do Samsung?".
🛒 Simulador: "posso comprar um tênis de 200 em 3x?", "e se meu salário for 3300?".
🏆 Metas: "como estão minhas metas?" (com gráfico), "guarda 100 na reserva", "tirei 900 da reserva". Depois do salário ela sugere quanto guardar — responder "guarda".
🗓️ Agenda e lembretes: "reunião amanhã às 14h", "lembrar de pagar o cartão sexta", "o que tenho pendente?".
🎫 Chamados e grupos: "quais chamados estão abertos?", "resumo do grupo PJe".
📔 Diário: contar como foi o dia ("hoje foi puxado, fiquei cansado...") — ela guarda com o humor.
🖥️ Painel web: tudo isso também aparece no painel (financeiro, metas, agenda, diário).`;

/**
 * Conversa: cumprimento, dúvida de como usar ou mensagem ambígua. Responde
 * com naturalidade e, quando ajudar, ensina a frase que aciona a função.
 * Nada é registrado aqui.
 */
async function answerChat(message: string, recentContext: string | undefined, ownerName: string, providerOpts: ProviderOptions): Promise<string> {
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
    return "🙂 Não entendi bem. Me manda *\"o que você faz?\"* que eu te mostro tudo que sei fazer.";
  }
}

async function buildQueryResponse(intent: PersonalQueryIntent): Promise<string> {
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
    return `🎯 *Metas de Economia:*\n${goals.map((g) => {
      const pct = (g.currentAmount / g.targetAmount) * 100;
      if (g.currentAmount >= g.targetAmount) return `• 🏆 ${g.name}: ${brl(g.targetAmount)} — *Conquistada!*`;
      return `• ${g.name}: ${brl(g.currentAmount)} de ${brl(g.targetAmount)} (${pct.toFixed(0)}%)`;
    }).join("\n")}`;
  }

  const summary = await prisma.dailySummary.findFirst({ orderBy: { createdAt: "desc" } });
  return summary ? summary.summary : "Nenhum resumo de grupo disponível ainda.";
}

export interface SelfMessageMeta {
  messageTimestamp: number;
}

// Quase tudo do dono é no cartão de crédito (milhas): quando ele não diz como
// pagou, o gasto entra como cartão e a confirmação pergunta se foi outro meio.
// Ele responde só com o número (ou o nome) e corrigimos SÓ aquele lançamento.
const PAYMENT_OPTIONS: Record<string, "cartão" | "pix" | "débito" | "dinheiro"> = {
  "1": "cartão", "cartão": "cartão", "cartao": "cartão", "crédito": "cartão", "credito": "cartão",
  "2": "pix", "pix": "pix",
  "3": "débito", "débito": "débito", "debito": "débito",
  "4": "dinheiro", "dinheiro": "dinheiro", "espécie": "dinheiro", "especie": "dinheiro",
};
const PAYMENT_QUESTION = "Pagou de outro jeito? Responda *2* pix · *3* débito · *4* dinheiro";
const PAYMENT_REPLY_WINDOW_MS = 60 * 60 * 1000;
// A mensagem cita uma data, um mês ou a fatura? Só assim a fatura que a IA
// extraiu ("billDate") passa por cima da regra do melhor dia.
const BILL_STATED_RE = /\d{1,2}\/\d{1,2}|\bfatura\b|\bvencimento\b|\b(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;
const PAYMENT_STATED_RE = /\b(pix|d[ée]bito|dinheiro|esp[ée]cie|boleto|cart[ãa]o|cr[ée]dito|ticket|vale)\b/i;

function formatDayMonth(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const formatFullDate = (d: Date) => `${formatDayMonth(d)}/${d.getFullYear()}`;
const PAYMENT_NAMES: Record<string, string> = { "cartão": "Cartão", pix: "Pix", "débito": "Débito", boleto: "Boleto", dinheiro: "Dinheiro", ticket: "Ticket" };

/**
 * Cartão padronizado de um lançamento, montado pelo código (não pela IA) —
 * a mesma mensagem gera sempre a mesma resposta.
 */
function entryCard(
  e: { description: string; category: string; subcategory: string; amount: number; type: string; paymentMethod: string; status: string; date: Date; purchaseDate: Date | null },
  title = "✅ Lançamento salvo!"
): string {
  const isCard = e.paymentMethod === "cartão";
  const method = PAYMENT_NAMES[e.paymentMethod] ?? e.paymentMethod;
  const when = isCard
    ? `💳 ${method} · fatura de ${formatFullDate(e.date)}`
    : `🏦 ${method} · ${e.status === "paid" ? (e.type === "income" ? "recebido" : "pago") : "vence"} em ${formatFullDate(e.date)}`;
  return [
    title,
    `📝 ${e.description || e.category}`,
    `💰 ${brl(e.amount)}`,
    `📂 ${e.category}${e.subcategory ? ` › ${e.subcategory}` : ""}`,
    `📊 ${e.type === "income" ? "Receita" : "Despesa"}`,
    when,
    ...(isCard && e.purchaseDate ? [`📅 Compra em ${formatFullDate(e.purchaseDate)}`] : []),
  ].join("\n");
}

const UNDO_HINT = "↩️ Errou? Responda *desfazer* ou *na verdade foi 25*.";

function paymentLabel(paymentMethod: string, date: Date): string {
  return paymentMethod === "cartão"
    ? `💳 cartão, fatura de ${formatDayMonth(date)}`
    : `${paymentMethod}, pago em ${formatDayMonth(date)}`;
}

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
    data: { paymentMethod: choice, date, status: isCard ? "pending" : "paid" },
  });
  return `✅ Corrigido: "${label}" (${brl(entry.amount)}) agora é ${paymentLabel(choice, date)}.`;
}

const SAVINGS_REPLY_MARK = "Responda *guarda*";

/** Acha a meta de reserva (nome com "reserva"), se existir. */
async function findReserveGoal() {
  const goals = await prisma.savingsGoal.findMany({ orderBy: { createdAt: "asc" } });
  return goals.find((g) => /reserva/i.test(g.name)) ?? null;
}

/**
 * Depois de receber salário: quanto sobra no mês (entradas − saídas já
 * lançadas) e uma sugestão de quanto guardar na Reserva — 10% do que entrou,
 * limitado à metade da sobra, arredondado para dezena.
 */
async function buildSavingsSuggestion(received: number): Promise<string> {
  const today = todayBRT();
  const { income, expense } = await monthTotals(today.getFullYear(), today.getMonth());
  const leftover = income - expense;
  const month = MONTH_NAMES[today.getMonth()];
  const reserve = await findReserveGoal();
  if (leftover <= 0) {
    return `\n\n⚠️ Com o que já está lançado, ${month} fecha em −${brl(Math.abs(leftover))}.${reserve ? ` Se usar a ${reserve.name}, me avise: "tirei X da ${reserve.name.toLowerCase()}".` : ""}`;
  }
  const suggestion = Math.floor(Math.min(received * 0.1, leftover * 0.5) / 10) * 10;
  if (!reserve || suggestion < 10) return `\n\n🟢 Depois das contas de ${month}, sobram ${brl(leftover)}.`;
  return `\n\n💰 Depois das contas de ${month}, sobram ${brl(leftover)}. Que tal guardar *${brl(suggestion)}* na ${reserve.name}? ${SAVINGS_REPLY_MARK} que eu já somo.`;
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
const NUMBER_PART = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const EDIT_AMOUNT_RE = new RegExp(String.raw`^(na verdade|na real|corrigindo|errei,?)\s*(foi|era|é|e|deu|custou|o valor (foi|era|é))?\s*(r\$\s*)?${NUMBER_PART}\s*(reais|conto|contos)?[.!]?$`, "i");
const AMOUNT_ONLY_RE = new RegExp(String.raw`^(foi\s*)?(r\$\s*)?${NUMBER_PART}\s*(reais|conto|contos)?[.!]?$`, "i");

/** "1.234,56" / "32,50" / "32.50" / "250" → número. */
function parseBrNumber(raw: string): number {
  if (raw.includes(",")) return Number(raw.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, ""));
  return Number(raw);
}

/** O que foi criado no último lançamento por mensagem (o gasto ou a série de parcelas). */
async function lastSavedEntries() {
  if (!lastSaved) return [];
  return prisma.financeEntry.findMany({
    where: { source: "whatsapp", createdAt: { gte: new Date(lastSaved.since.getTime() - 2000), lte: new Date(lastSaved.since.getTime() + 30_000) } },
    orderBy: { date: "asc" },
  });
}

/** "desfazer" e "na verdade foi 250". Devolve a resposta, ou null se não for o caso. */
async function applyUndoOrEdit(text: string): Promise<string | null> {
  const t = text.trim();
  const isUndo = UNDO_RE.test(t);
  const edit = isUndo ? null : t.match(EDIT_AMOUNT_RE);
  if (!isUndo && !edit) return null;

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
  const { extractPdfText, pdfPasswordError } = await import("./pdf");
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

export async function handleSelfMessage(joinedText: string, _meta: SelfMessageMeta): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  // Resposta com o valor que faltava ("25") completa a frase anterior.
  joinedText = takeAmountReply(joinedText) ?? joinedText;

  // Senha de PDF não passa pela IA nem é gravada no histórico.
  if (await applyPdfPassword(joinedText, config)) return;
  if (await applyStatementChoice(joinedText, config)) return;

  const providerOpts = getProviderOpts(config);

  let conv = await prisma.conversation.findFirst({
    where: { phone: config.ownerPhone, source: "self" },
    include: { messages: { orderBy: { createdAt: "desc" }, take: config.historyLimit } },
  });

  const paymentReply =
    (await applyUndoOrEdit(joinedText)) ?? (await applySavingsReply(joinedText, conv?.messages)) ?? (await applyPaymentReply(joinedText, config));
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
          dueDate: route.dueDate ? new Date(route.dueDate) : null,
          rawMessage: joinedText,
        },
      });
      break;
    case "finance": {
      // Sem valor ("gastei com uber"): não grava, pergunta e espera a resposta.
      if (!(route.amount > 0)) {
        pendingAmount = { text: joinedText, at: Date.now() };
        response = `💬 Quanto foi ${route.description ? `*${route.description}*` : "esse gasto"}? Responda só o valor (ex: 25,90).`;
        break;
      }
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
      if (isCardExpense) {
        route.purchaseDate = cardPurchaseDate.toISOString();
        route.date = (route.billDate && BILL_STATED_RE.test(joinedText)
          ? parseLocalDate(route.billDate)
          : creditCardBillDate(cardPurchaseDate, config.creditCardDueDay || 10, config.creditCardBestDay || 5)
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
            response += await buildSavingsSuggestion(newAmount);
          }
        } else {
          let finalMood = route.mood || "neutro";
          
          if (finalMood === "neutro") {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            
            const todayDiary = await prisma.diaryEntry.findFirst({
              where: { date: { gte: todayStart, lte: todayEnd }, mood: { not: "" } },
              orderBy: { date: "desc" }
            });
            if (todayDiary && todayDiary.mood && todayDiary.mood !== "neutro") {
              finalMood = todayDiary.mood;
            }
          }

          lastSaved = { since: new Date() };
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
              mood: finalMood,
              source: "whatsapp",
            },
          });

          // Resposta montada pelo código (antes era o texto livre da IA).
          response = `${entryCard(created, created.type === "income" ? "✅ Receita salva!" : "✅ Lançamento salvo!")}\n\n${
            askPayment ? `${PAYMENT_QUESTION}\nOutro dia de compra? Responda a data (ex: 15/08).\n` : ""
          }${UNDO_HINT}`;

          if (route.financeType === "income" && /sal[aá]rio/i.test(created.category)) {
            response += await buildSavingsSuggestion(created.amount);
          }

          if (finalMood === "neutro" && route.financeType === "expense" && route.amount >= 100) {
            response += `\n\n🤔 Percebi esse gasto mais elevado. Como você está se sentindo hoje? (Seu humor me ajuda a mapear seus gastos emocionais!)`;
          }
        }

        // 🎯 Verificar alerta de orçamento se for uma despesa
        if (route.financeType === "expense") {
          const mDate = route.date ? parseLocalDate(route.date) : new Date();
          const monthStr = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, "0")}`;
          
          const budget = await prisma.budget.findFirst({
            where: {
              category: route.category,
              OR: [{ month: monthStr }, { month: "default" }],
            },
          });

          if (budget) {
            // Somar despesas daquele mês para a categoria
            const startOfMonth = new Date(mDate.getFullYear(), mDate.getMonth(), 1);
            const endOfMonth = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0, 23, 59, 59);
            
            const monthExpenses = await prisma.financeEntry.aggregate({
              _sum: { amount: true },
              where: {
                type: "expense",
                category: route.category,
                date: { gte: startOfMonth, lte: endOfMonth }
              }
            });

            const totalSpent = monthExpenses._sum.amount || 0;
            const percent = (totalSpent / budget.amount) * 100;

            const isSensitiveCategory = ["delivery", "ifood", "mercado", "supermercado", "bebida", "cerveja", "lanche", "besteira"]
              .some(kw => route.category.toLowerCase().includes(kw) || route.subcategory.toLowerCase().includes(kw));

            if ((percent >= 80 || isSensitiveCategory) && route.amount >= 30) {
              const promptContext = `O usuário Renato registrou um gasto de ${brl(route.amount)} na categoria "${route.category}" (Subcategoria: "${route.subcategory}").
Neste mês, ele já gastou ${brl(totalSpent)} de um orçamento de ${brl(budget.amount)} nesta categoria (${percent.toFixed(0)}%).
Dê um "toque" inteligente, amigável e MUITO CURTO (máximo 2 linhas). 
Se for delivery, besteira ou álcool e estiver alto, alerte sobre gastar muito com besteira e faça ele refletir se era necessário.
Se for mercado e a compra for alta, lembre-o para focar no necessário para não estourar o mês.
Não seja robótico. Chame-o de Renato.`;
              try {
                const { content } = await generateResponse([{ role: "user", content: promptContext }], "Você é uma assistente financeira.", 0.7, 150, providerOpts);
                response += `\n\n💬 *Dica da IA:* ${content}`;
              } catch (e) {
                if (percent >= 100) response += `\n\n🚨 *ALERTA:* Você estourou o limite de ${route.category}! (${brl(totalSpent)} de ${brl(budget.amount)})`;
                else if (percent >= 80) response += `\n\n⚠️ *Aviso:* ${percent.toFixed(0)}% do limite de ${route.category} atingido!`;
              }
            } else {
              if (percent >= 100) {
                response += `\n\n🚨 *ALERTA DE ORÇAMENTO:* Com esse gasto, você estourou o limite de ${route.category}! (Gastou ${brl(totalSpent)} de ${brl(budget.amount)})`;
              } else if (percent >= 80) {
                response += `\n\n⚠️ *Aviso de Orçamento:* Você já usou ${percent.toFixed(0)}% do seu limite de ${route.category} neste mês! (Restam ${brl((budget.amount - totalSpent))})`;
              }
            }
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
          // "Tirei/usei/saquei X da reserva" = retirada, mesmo se a IA mandar positivo.
          const isWithdraw = route.amount < 0 || /\b(tirei|retirei|saquei|usei|peguei)\b/i.test(joinedText);
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
    case "finance_question":
      response = await answerFinanceQuestion(route.question, providerOpts);
      break;
    case "chat":
      response = await answerChat(joinedText, recentContext, config.ownerName, providerOpts);
      break;
    case "diary":
      await prisma.diaryEntry.create({
        data: {
          content: route.content,
          mood: route.mood,
          source: "whatsapp",
        },
      });
      if (route.mood && route.mood !== "neutro") {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        await prisma.financeEntry.updateMany({
          where: {
            date: { gte: todayStart, lte: todayEnd },
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

/**
 * Detecta "Parcela X/Y" (e opcionalmente "(compra em DD/MM)") numa descrição
 * — seja gerada pelo parser de extrato ou digitada à mão pelo usuário direto
 * no campo de edição — e devolve a descrição "base" sem esses pedaços (pra
 * comparar entradas da mesma compra parcelada entre si). Se a descrição não
 * tiver "(compra em DD/MM)" explícito, usa a data do próprio lançamento
 * (fallbackDate) como referência — é o caso de quem só digita "Parcela 3/12"
 * na edição, sem se preocupar com a data original da compra.
 */
function parseInstallmentInfo(
  description: string,
  fallbackDate?: Date
): { current: number; total: number; purchaseDate: string; baseDescription: string } | null {
  const parcelaMatch = description.match(/Parcela (\d+)\/(\d+)/);
  if (!parcelaMatch) return null;
  const compraMatch = description.match(/\(compra em (\d{2})\/(\d{2})\)/);

  const baseDescription = description
    .replace(/\s*-?\s*Parcela \d+\/\d+/, "")
    .replace(/\s*\(compra em \d{2}\/\d{2}\)/, "")
    .replace(/\s*\(previsto\)/, "")
    .trim();

  const purchaseDate = compraMatch
    ? `${compraMatch[2]}-${compraMatch[1]}` // MM-DD, estável entre reimportações
    : fallbackDate
    ? `${String(fallbackDate.getMonth() + 1).padStart(2, "0")}-${String(fallbackDate.getDate()).padStart(2, "0")}`
    : null;
  if (!purchaseDate) return null;

  return {
    current: Number(parcelaMatch[1]),
    total: Number(parcelaMatch[2]),
    purchaseDate,
    baseDescription,
  };
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function installmentKey(baseDescription: string, purchaseDate: string, total: number, amount: number, targetDate: Date): string {
  return `${baseDescription}|${purchaseDate}|${total}|${amount.toFixed(2)}|${targetDate.getFullYear()}-${targetDate.getMonth()}`;
}

function subscriptionKey(description: string, amount: number, targetDate: Date): string {
  return `sub|${description}|${amount.toFixed(2)}|${targetDate.getFullYear()}-${targetDate.getMonth()}`;
}

const SUBSCRIPTION_PROJECTION_MONTHS = 11;

/**
 * Núcleo compartilhado: expande parcelas restantes e assinaturas recorrentes
 * em entradas futuras "(previsto)", dedupe contra o banco, e insere o que é
 * novo. Não notifica o dono — quem chama decide se/como avisar (o fluxo de
 * extrato via WhatsApp avisa; edição manual no painel não precisa).
 */
export async function projectAndInsertFinanceEntries(
  entries: StatementEntry[],
  source: "whatsapp" | "dashboard" = "whatsapp",
  creditCardDueDay?: number
): Promise<{ toInsert: StatementEntry[]; duplicates: number; projected: number; matchedManual: StatementEntry[] }> {
  // Junta as parcelas restantes (ex: Parcela 6/10 vira também 7/10..10/10 em
  // meses futuros) e assinaturas recorrentes (categoria "Assinaturas" sem
  // parcela — ex: Anthropic, Netflix) com as entradas reais desse extrato,
  // pra já projetar o fluxo de caixa dos próximos meses.
  const candidates: { entry: StatementEntry; date: Date; key: string | null }[] = [];

  for (const e of entries) {
    const baseDate = parseLocalDate(e.date);
    const info = parseInstallmentInfo(e.description, baseDate);

    if (info) {
      candidates.push({
        entry: e,
        date: baseDate,
        key: installmentKey(info.baseDescription, info.purchaseDate, info.total, e.amount, baseDate),
      });
      if (info.current < info.total) {
        for (let i = info.current + 1; i <= info.total; i++) {
          const futureDate = addMonths(baseDate, i - info.current);
          if (creditCardDueDay && (e.category === "Cartão" || e.category === "Financeiro" || e.description.toLowerCase().includes("parcela"))) {
            futureDate.setDate(creditCardDueDay);
          }
          const futureDescription = `${info.baseDescription} - Parcela ${i}/${info.total} (compra em ${info.purchaseDate.split("-")[1]}/${info.purchaseDate.split("-")[0]}) (previsto)`;
          candidates.push({
            entry: { ...e, description: futureDescription, date: futureDate.toISOString(), status: "pending" },
            date: futureDate,
            key: installmentKey(info.baseDescription, info.purchaseDate, info.total, e.amount, futureDate),
          });
        }
      }
    } else if (e.category === "Assinaturas" || /\(recorrente\)/.test(e.description)) {
      // Assinatura (categoria "Assinaturas") ou qualquer lançamento marcado
      // "(recorrente)" pelo usuário (ex: salário) = repete todo mês, sem fim
      // previsto. Projeta um horizonte fixo; cada reimportação/edição futura
      // da mesma entrada estende a janela pra frente automaticamente.
      // Cancelar é só apagar a entrada daquele mês específico na tabela.
      const baseDescription = e.description.replace(/\s*\(recorrente\)/, "").trim();
      candidates.push({
        entry: { ...e, description: baseDescription },
        date: baseDate,
        key: subscriptionKey(baseDescription, e.amount, baseDate),
      });
      for (let i = 1; i <= SUBSCRIPTION_PROJECTION_MONTHS; i++) {
        const futureDate = addMonths(baseDate, i);
        candidates.push({
          entry: { ...e, description: `${baseDescription} (previsto)`, date: futureDate.toISOString(), status: "pending" },
          date: futureDate,
          key: subscriptionKey(baseDescription, e.amount, futureDate),
        });
      }
    } else {
      candidates.push({ entry: e, date: baseDate, key: null });
    }
  }

  // Dedupe contra o que já existe no banco (de uma importação anterior, real
  // ou projetada) e dentro do próprio lote que acabou de ser montado.
  const existing = await prisma.financeEntry.findMany({
    where: {
      OR: [
        { description: { contains: "Parcela " } },
        { category: "Assinaturas" },
        { description: { contains: "(recorrente)" } },
      ],
    },
    select: { description: true, date: true, amount: true, category: true },
  });
  const existingKeys = new Set(
    existing
      .map((e) => {
        const info = parseInstallmentInfo(e.description, e.date);
        if (info) return installmentKey(info.baseDescription, info.purchaseDate, info.total, e.amount, e.date);
        if (e.category === "Assinaturas" || /\(recorrente\)/.test(e.description)) {
          const baseDescription = e.description.replace(/\s*\(previsto\)/, "").replace(/\s*\(recorrente\)/, "").trim();
          return subscriptionKey(baseDescription, e.amount, e.date);
        }
        return null;
      })
      .filter((k): k is string => k !== null)
  );

  // Compras avulsas no cartão (sem parcela/assinatura) que o dono já anotou à
  // mão: mesmo valor e data de compra até 3 dias de diferença. Cada lançamento
  // existente só "absorve" uma linha da fatura — se ele anotou 1 almoço de
  // R$ 26 e a fatura tem 2, o segundo entra.
  const looseCard = candidates.filter((c) => !c.key && c.entry.type === "expense" && c.entry.paymentMethod === "cartão");
  const manualCard = looseCard.length === 0 ? [] : await prisma.financeEntry.findMany({
    where: {
      type: "expense",
      paymentMethod: "cartão",
      date: {
        gte: new Date(Math.min(...looseCard.map((c) => c.date.getTime())) - 40 * 86400000),
        lte: new Date(Math.max(...looseCard.map((c) => c.date.getTime())) + 40 * 86400000),
      },
    },
    select: { id: true, amount: true, date: true, purchaseDate: true },
  });
  const usedManual = new Set<string>();
  const matchedManual: StatementEntry[] = [];
  const DAY_MS = 86400000;

  const toInsert: StatementEntry[] = [];
  let duplicates = 0;
  let projected = 0;
  const seenThisBatch = new Set<string>();

  for (const c of candidates) {
    if (c.key) {
      if (existingKeys.has(c.key) || seenThisBatch.has(c.key)) {
        duplicates++;
        continue;
      }
      seenThisBatch.add(c.key);
    } else if (c.entry.type === "expense" && c.entry.paymentMethod === "cartão") {
      const bought = c.entry.purchaseDate ? parseLocalDate(c.entry.purchaseDate) : c.date;
      const match = manualCard.find((m) =>
        !usedManual.has(m.id) &&
        Math.abs(m.amount - c.entry.amount) <= 0.01 &&
        Math.abs((m.purchaseDate ?? m.date).getTime() - bought.getTime()) <= 3 * DAY_MS
      );
      if (match) {
        usedManual.add(match.id);
        matchedManual.push(c.entry);
        continue;
      }
    }
    if (c.entry.description.includes("(previsto)")) projected++;
    toInsert.push(c.entry);
  }

  if (toInsert.length > 0) {
    await prisma.financeEntry.createMany({
      data: toInsert.map((e) => ({
        type: e.type,
        amount: e.amount,
        category: e.category,
        subcategory: e.subcategory,
        description: e.description,
        date: parseLocalDate(e.date),
        purchaseDate: e.purchaseDate ? parseLocalDate(e.purchaseDate) : null,
        paymentMethod: e.paymentMethod || "pix",
        account: e.account || "Principal",
        status: e.status || "paid",
        source,
      })),
    });
  }

  return { toInsert, duplicates, projected, matchedManual };
}

export async function saveStatementEntries(config: AgentConfig, entries: StatementEntry[], sourceLabel: string): Promise<void> {
  if (entries.length === 0) {
    await notifyOwner(config, `⚠️ Recebi ${sourceLabel} mas não consegui identificar nenhuma transação.`);
    return;
  }

  const { toInsert, duplicates, projected, matchedManual } = await projectAndInsertFinanceEntries(entries, "whatsapp", config.creditCardDueDay);

  if (toInsert.length === 0) {
    await notifyOwner(config, `⚠️ Recebi ${sourceLabel}, mas todas as transações já estavam lançadas (importadas antes ou anotadas por você).`);
    return;
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
    response += `\n✍️ ${matchedManual.length} você já tinha anotado (mesmo valor, data parecida) — não lancei de novo:\n${list}${matchedManual.length > 15 ? "\n…" : ""}`;
  }
  await notifyOwner(config, response);
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
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  // Fatura com titular + adicionais: separa pelos cabeçalhos "Final XXXX - NOME".
  // Um cartão só importa direto; mais de um, pergunta quais importar.
  const { splitCardSections, holderMatches } = await import("./pdf");
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
  const { holderMatches } = await import("./pdf");
  const providerOpts = getProviderOpts(config);
  const header = statementText.slice(0, 600);
  const entries: StatementEntry[] = [];
  for (const sec of chosen) {
    const text = `CABEÇALHO DA FATURA (só para saber o vencimento — NÃO extraia transações daqui):
${header}

TRANSAÇÕES DO CARTÃO FINAL ${sec.last4} (extraia todas estas). "Pagamento Fatura" é o pagamento da fatura anterior: ignore, não é receita.
${sec.text}`;
    // ownerName vazio: a escolha do cartão já foi feita aqui, o prompt não deve filtrar de novo.
    const parsed = await parseStatementEntries(text, providerOpts, "");
    const mine = holderMatches(sec.holder, config.ownerName);
    entries.push(...(mine ? parsed : parsed.map((e) => ({ ...e, description: `${e.description} · cartão final ${sec.last4}`.slice(0, 200) }))));
  }
  console.log(`[statement:pdf] ${chosen.length} cartão(ões) importado(s), ${entries.length} transações`);
  await saveStatementEntries(config, entries, "o PDF");
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
  await notifyOwner(config, check);
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
export async function handleStatementImage(base64: string, mimetype: string): Promise<void> {
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
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.ownerPhone) return;

  const providerOpts = getProviderOpts(config);
  const invoice = await parseInvoiceImage(base64, mimetype, providerOpts, config.ownerName, caption);

  if (!invoice || invoice.items.length === 0) {
    await notifyOwner(config, `⚠️ Não consegui ler os itens dessa nota fiscal. A imagem pode estar embaçada.`);
    return;
  }

  let calculatedTotal = invoice.items.reduce((acc, i) => acc + (i.amount || (i.quantity * i.unitPrice)), 0);
  const diff = Number((invoice.total - calculatedTotal).toFixed(2));

  // Se a diferença for de até R$ 15.00 (ex: descontos de itens/nota ou pequenos arredondamentos),
  // insere automaticamente um item de desconto/ajuste para fechar a conta perfeitamente.
  if (Math.abs(diff) >= 0.01 && Math.abs(diff) <= 15.0) {
    invoice.items.push({
      name: diff < 0 ? "Desconto da Nota" : "Ajuste / Acréscimo Nota",
      category: "Desconto / Ajuste",
      quantity: 1,
      unitPrice: diff,
      amount: diff
    });
    calculatedTotal = invoice.total;
  } else if (Math.abs(calculatedTotal - invoice.total) > 2.0) {
    await notifyOwner(config, `⚠️ *Conta não fechou!* O total lido na nota foi ${brl(invoice.total)}, mas a soma dos ${invoice.items.length} itens deu ${brl(calculatedTotal)}. Por segurança contra alucinações da IA, não salvei a nota. Tente mandar uma foto mais nítida.`);
    return;
  }

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

  if (readMethod === "ticket" || (invoice.account || "").toLowerCase().includes("ticket")) {
    paymentMethod = "ticket";
    account = "Ticket Alimentação";
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

  let finalMood = "neutro";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  
  const todayDiary = await prisma.diaryEntry.findFirst({
    where: { date: { gte: todayStart, lte: todayEnd }, mood: { not: "" } },
    orderBy: { date: "desc" }
  });
  if (todayDiary && todayDiary.mood && todayDiary.mood !== "neutro") {
    finalMood = todayDiary.mood;
  }

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
          category: i.category,
          amount: i.amount,
          quantity: i.quantity,
          unitPrice: i.unitPrice
        }))
      }
    }
  });

  const detective = await priceChanges(entry.id, invoice.items).catch((err) => {
    console.error("[detetive] falha ao comparar preços", err);
    return "";
  });

  let response = `✅ Nota fiscal de ${brl(invoice.total)} salva com sucesso!\n(${invoice.items.length} itens registrados em detalhes na sua dashboard)\nPagamento: ${paymentLabel(paymentMethod, invoiceDate)}.\n${paymentMethod === "cartão" ? PAYMENT_QUESTION : "Se foi no cartão, responda *1*."}${detective}`;

  if (finalMood === "neutro") {
    response += `\n\n🤔 Percebi esse gasto. Como você está se sentindo hoje? (Seu humor me ajuda a mapear seus gastos emocionais!)`;
  }

  const budget = await prisma.budget.findFirst({
    where: {
      category: invoice.category,
      OR: [{ month: "default" }],
    },
  });

  if (budget) {
    const startOfMonth = new Date(entry.date.getFullYear(), entry.date.getMonth(), 1);
    const endOfMonth = new Date(entry.date.getFullYear(), entry.date.getMonth() + 1, 0, 23, 59, 59);
    
    const monthExpenses = await prisma.financeEntry.aggregate({
      _sum: { amount: true },
      where: { type: "expense", category: invoice.category, date: { gte: startOfMonth, lte: endOfMonth } }
    });

    const totalSpent = monthExpenses._sum.amount || 0;
    const percent = (totalSpent / budget.amount) * 100;

    const isSensitiveCategory = ["delivery", "ifood", "mercado", "supermercado", "bebida", "cerveja", "lanche", "besteira"]
      .some(kw => invoice.category?.toLowerCase().includes(kw) || invoice.subcategory?.toLowerCase().includes(kw));

    if ((percent >= 80 || isSensitiveCategory) && invoice.total >= 50) {
      const promptContext = `O usuário Renato registrou uma Nota Fiscal de ${brl(invoice.total)} na categoria "${invoice.category}" (Subcategoria: "${invoice.subcategory}").
Neste mês, ele já gastou ${brl(totalSpent)} de um orçamento de ${brl(budget.amount)} nesta categoria (${percent.toFixed(0)}%).
Dê um "toque" inteligente, amigável e MUITO CURTO (máximo 2 linhas). 
Se for mercado e a compra for alta, lembre-o para focar no necessário e cuidado com bebidas/besteiras para não estourar o limite.
Se for delivery ou lanche, alerte sobre o excesso.
Não seja robótico. Chame-o de Renato.`;
      try {
        const { content } = await generateResponse([{ role: "user", content: promptContext }], "Você é uma assistente financeira.", 0.7, 150, providerOpts);
        response += `\n\n💬 *Dica da IA:* ${content}`;
      } catch (e) {
        if (percent >= 100) response += `\n\n🚨 *ALERTA:* Você estourou o limite de ${invoice.category}! (${brl(totalSpent)} de ${brl(budget.amount)})`;
        else if (percent >= 80) response += `\n\n⚠️ *Aviso:* ${percent.toFixed(0)}% do limite de ${invoice.category} atingido!`;
      }
    } else {
      if (percent >= 100) {
        response += `\n\n🚨 *ALERTA DE ORÇAMENTO:* Com essa nota, você estourou o limite de ${invoice.category}! (Gastou ${brl(totalSpent)} de ${brl(budget.amount)})`;
      } else if (percent >= 80) {
        response += `\n\n⚠️ *Aviso de Orçamento:* Você já usou ${percent.toFixed(0)}% do limite de ${invoice.category}! (Restam ${brl((budget.amount - totalSpent))})`;
      }
    }
  }

  await notifyOwner(config, response);
}

export interface PrivateMessageMeta {
  phone: string;
  pushName: string;
  messageTimestamp: number;
}

export async function handlePrivateMessage(joinedText: string, meta: PrivateMessageMeta): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.enabled) return;

  const providerOpts = getProviderOpts(config);
  const contactName = meta.pushName || meta.phone;

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

export interface GroupMessageMeta {
  remoteJid: string;
  senderName: string;
  messageTimestamp: number;
}

export async function handleGroupMessage(joinedText: string, meta: GroupMessageMeta): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.enabled) return;

  const providerOpts = getProviderOpts(config);
  const groupJid = meta.remoteJid;

  let groupConfig = await prisma.groupConfig.findUnique({ where: { groupJid } });
  if (!groupConfig) {
    let newGroupName = groupJid.split("@")[0];
    if (config.evolutionUrl && config.evolutionApiKey && config.instanceId) {
      const info = await fetchGroupInfo(config.evolutionUrl, config.evolutionApiKey, config.instanceId, groupJid);
      if (info?.subject) {
        newGroupName = info.subject;
      }
    }
    groupConfig = await prisma.groupConfig.create({
      data: { groupJid, groupName: newGroupName, active: true },
    });
  } else if (/^\d+$/.test(groupConfig.groupName)) {
    if (config.evolutionUrl && config.evolutionApiKey && config.instanceId) {
      const info = await fetchGroupInfo(config.evolutionUrl, config.evolutionApiKey, config.instanceId, groupJid);
      if (info?.subject && info.subject !== groupConfig.groupName) {
        groupConfig = await prisma.groupConfig.update({
          where: { groupJid },
          data: { groupName: info.subject },
        });
      }
    }
  }
  if (!groupConfig.active) return;

  const groupName = groupConfig.groupName || groupJid.split("@")[0];
  let processedText = joinedText;

  if (config.evolutionUrl && config.evolutionApiKey && config.instanceId) {
    processedText = await resolveMentions(joinedText, config.evolutionUrl, config.evolutionApiKey, config.instanceId);
  }

  await prisma.groupMessage.create({
    data: {
      groupJid,
      groupName,
      senderName: meta.senderName,
      content: processedText,
      receivedAt: new Date(meta.messageTimestamp * 1000),
    },
  });

  let conv = await prisma.conversation.findFirst({ where: { phone: groupJid, source: "group" } });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { phone: groupJid, source: "group" } });
  }
  await prisma.message.create({
    data: { conversationId: conv.id, role: "user", content: `[${meta.senderName}] ${processedText}` },
  });

  const classification = await classifyGroupMessage(
    processedText,
    meta.senderName,
    groupName,
    groupConfig.focus,
    config.ownerName,
    config.ownerRole,
    providerOpts,
    config.systemPrompt
  );

  if (classification.ticketIds.length > 0) {
    await extractAndSaveTickets(classification.ticketIds, processedText, meta.senderName, groupJid, groupName);
  }

  if (classification.urgent && classification.category !== "ignore") {
    const agendaItem = await prisma.agendaItem.create({
      data: {
        source: "group",
        groupJid,
        groupName,
        category: classification.category ?? "mention",
        title: classification.title,
        description: classification.description,
        dueDate: classification.dueDate ? new Date(classification.dueDate) : null,
        senderName: meta.senderName,
        rawMessage: joinedText,
      },
    });

    if (config.ownerPhone && config.evolutionUrl) {
      const hora = formatTime(meta.messageTimestamp);
      const categoryBadge =
        classification.category === "mention"
          ? "🔔 Você foi mencionado"
          : classification.category === "task"
          ? "📋 Tarefa atribuída"
          : classification.category === "event"
          ? "📅 Evento com sua presença"
          : classification.category === "urgent_call"
          ? "🚨 Chamado urgente"
          : "";

      const notification = `👥 *${groupName}*\n👤 ${meta.senderName} — 🕐 ${hora}\n\n📌 *${classification.title}*\n${classification.description}${classification.dueDate ? `\n📅 ${new Date(classification.dueDate).toLocaleDateString("pt-BR")}` : ""}\n${categoryBadge}`;

      await notifyOwner(config, notification);
      await prisma.agendaItem.update({ where: { id: agendaItem.id }, data: { notified: true } });
    }
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
}
