// Textos do financeiro: o cartão de um lançamento, nomes das formas de pagamento,
// datas e horas no formato dele e a leitura de valores ("1.234,56"). Saiu de
// message-handlers.ts (28/10/2026) — sem estado de conversa.

import { brlMsg as brl } from "./format";
import { formatDayMonth } from "./finance-common";

export function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  let h = d.getUTCHours() - 3;
  if (h < 0) h += 24;
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${String(h).padStart(2, "0")}:${m}`;
}

// Quase tudo do dono é no cartão de crédito (milhas): quando ele não diz como
// pagou, o gasto entra como cartão e a confirmação pergunta se foi outro meio.
// Ele responde só com o número (ou o nome) e corrigimos SÓ aquele lançamento.
export const PAYMENT_OPTIONS: Record<string, "cartão" | "pix" | "débito" | "dinheiro" | "ticket"> = {
  "1": "cartão", "cartão": "cartão", "cartao": "cartão", "crédito": "cartão", "credito": "cartão",
  "2": "pix", "pix": "pix",
  "3": "débito", "débito": "débito", "debito": "débito",
  "4": "dinheiro", "dinheiro": "dinheiro", "espécie": "dinheiro", "especie": "dinheiro",
  "5": "ticket", "vr": "ticket", "vale": "ticket", "ticket": "ticket", "va": "ticket",
};

export const formatFullDate = (d: Date) => `${formatDayMonth(d)}/${d.getFullYear()}`;

export const PAYMENT_NAMES: Record<string, string> = { "cartão": "Cartão", pix: "Pix", "débito": "Débito", boleto: "Boleto", dinheiro: "Dinheiro", ticket: "VR" };

/**
 * Cartão padronizado de um lançamento, montado pelo código (não pela IA) —
 * a mesma mensagem gera sempre a mesma resposta.
 */
export function entryCard(
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

export function paymentLabel(paymentMethod: string, date: Date): string {
  return paymentMethod === "cartão"
    ? `💳 cartão, fatura de ${formatDayMonth(date)}`
    : `${PAYMENT_NAMES[paymentMethod] ?? paymentMethod}, pago em ${formatDayMonth(date)}`;
}

export const NUMBER_PART = String.raw`(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;

/** "1.234,56" / "32,50" / "32.50" / "250" → número. */
export function parseBrNumber(raw: string): number {
  if (raw.includes(",")) return Number(raw.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, ""));
  return Number(raw);
}

export const fmtBRT = (d: Date, withTime: boolean) => {
  const b = new Date(d.getTime() - 3 * 3600_000);
  const dd = `${String(b.getUTCDate()).padStart(2, "0")}/${String(b.getUTCMonth() + 1).padStart(2, "0")}`;
  return withTime ? `${dd} às ${String(b.getUTCHours()).padStart(2, "0")}:${String(b.getUTCMinutes()).padStart(2, "0")}` : dd;
};
