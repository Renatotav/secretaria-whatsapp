// Pagamento dividido ("100 no pix e o resto no cartão") e separar várias compras
// numa mensagem. Saiu de message-handlers.ts (28/10/2026) — sem estado de conversa.

import { prisma } from "./prisma";
import { todayBRT, creditCardBillDate, billDaysFor } from "./dates";
import { brlMsg as brl } from "./format";
import { NUMBER_PART, parseBrNumber, paymentLabel } from "./finance-text";

export type SplitPart = { amount: number; paymentMethod: string; account: string; label: string };

export const SPLIT_METHOD = String.raw`vale\s+antigo|vr|va|vale|ticket|pix|d[eé]bito|dinheiro|esp[eé]cie|cart[aã]o|cr[eé]dito`;

export function splitMethod(raw: string): { paymentMethod: string; account: string; label: string } {
  const m = raw.toLowerCase();
  if (/antigo/.test(m)) return { paymentMethod: "ticket", account: "Vale antigo", label: "vale antigo" };
  if (/^(vr|va|vale|ticket)$/.test(m)) return { paymentMethod: "ticket", account: "VR", label: "VR" };
  if (m === "pix") return { paymentMethod: "pix", account: "Principal", label: "Pix" };
  if (/^d/.test(m)) return { paymentMethod: "débito", account: "Principal", label: "débito" };
  if (/^(dinheiro|esp)/.test(m)) return { paymentMethod: "dinheiro", account: "Principal", label: "dinheiro" };
  return { paymentMethod: "cartão", account: "Principal", label: "cartão" };
}

/** "100 no VR e 80 no cartão" / "25,35 no vale antigo, o resto no cartão" → partes; null se não for divisão. */
export function parseSplit(text: string, total: number): SplitPart[] | { erro: string } | null {
  const t = text.toLowerCase();
  const parts: SplitPart[] = [];
  const re = new RegExp(String.raw`(?:r\$\s*)?${NUMBER_PART}\s*(?:reais\s*)?(?:no|na|em|de|pelo|pela)\s+(${SPLIT_METHOD})\b`, "gi");
  for (const m of t.matchAll(re)) parts.push({ amount: Math.round(parseBrNumber(m[1]) * 100) / 100, ...splitMethod(m[2]) });
  const resto = t.match(new RegExp(String.raw`(?:o\s+)?resto\s+(?:no|na|em|de|pelo|pela)\s+(${SPLIT_METHOD})\b`, "i"));
  if (!parts.length || (parts.length < 2 && !resto)) return null;
  const soma = parts.reduce((a, p) => a + p.amount, 0);
  if (resto) {
    const falta = Math.round((total - soma) * 100) / 100;
    if (falta <= 0) return { erro: `As partes já somam ${brl(soma)} (o total é ${brl(total)}), não sobra resto.` };
    parts.push({ amount: falta, ...splitMethod(resto[1]) });
  } else if (Math.abs(soma - total) > 0.05) {
    return { erro: `As partes somam ${brl(soma)}, mas o total é ${brl(total)}. Mande de novo com os valores certos (ou "o resto no cartão").` };
  }
  return parts;
}

/** Divide o lançamento: o original fica com a 1ª parte (e os itens da nota); as outras viram lançamentos novos. */
export async function applySplit(entryId: string, parts: SplitPart[]): Promise<string> {
  const e = await prisma.financeEntry.findUnique({ where: { id: entryId } });
  if (!e) return "Esse lançamento não existe mais.";
  const config = await prisma.agentConfig.findFirst({ select: { creditCardDueDay: true, creditCardBestDay: true, cardBillDays: true } });
  const purchase = e.purchaseDate ?? e.date;
  const datesFor = (method: string) => {
    if (method !== "cartão") return { date: purchase, status: "paid" };
    const d = billDaysFor(config, e.card);
    const date = creditCardBillDate(purchase, d.due, d.best);
    return { date, status: date.getTime() >= todayBRT().getTime() ? "pending" : "paid" };
  };
  const base = e.description.replace(/\s*\(parte n[oa] [^)]*\)\s*$/i, "");
  const [first, ...rest] = parts;
  await prisma.financeEntry.update({ where: { id: e.id }, data: { amount: first.amount, paymentMethod: first.paymentMethod, account: first.account, ...datesFor(first.paymentMethod) } });
  for (const p of rest) {
    await prisma.financeEntry.create({
      data: {
        type: e.type, amount: p.amount, category: e.category, subcategory: e.subcategory,
        description: `${base} (parte no ${p.label})`.slice(0, 200), purchaseDate: purchase,
        paymentMethod: p.paymentMethod, account: p.account, card: e.card, mood: e.mood, source: e.source,
        ...datesFor(p.paymentMethod),
      },
    });
  }
  const linhas = parts.map((p) => { const d = datesFor(p.paymentMethod); return `• ${brl(p.amount)} — ${paymentLabel(p.paymentMethod, d.date)}${p.account === "Vale antigo" ? " (vale antigo)" : ""}`; });
  return `✂️ *Pagamento dividido:* ${base.replace(/^Nota Fiscal \(\d+ itens\) - ?/, "Nota fiscal ").trim() || e.category} · total ${brl(parts.reduce((a, p) => a + p.amount, 0))}\n${linhas.join("\n")}${e.description.startsWith("Nota Fiscal") ? "\nOs itens da nota ficam no primeiro lançamento." : ""}`;
}

/**
 * Divide o texto de um cartão em pedaços de até maxChars, cortando antes de
 * uma data de compra ("14 fev", "03 set"), para nenhuma compra ficar partida.
 */
export function splitTransactions(text: string, maxChars: number): string[] {
  const parts = text.split(/(?=\b\d{2} (?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b)/i);
  const pieces: string[] = [];
  let current = "";
  for (const part of parts) {
    if (current && current.length + part.length > maxChars) {
      pieces.push(current);
      current = "";
    }
    current += part;
  }
  if (current.trim()) pieces.push(current);
  return pieces;
}
