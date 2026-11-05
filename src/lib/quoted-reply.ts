// Corrigir respondendo à mensagem citada ("na verdade foi 230", "era pix"): acha
// o lançamento da mensagem e o que mudar. Saiu de message-handlers.ts (28/10/2026) —
// sem estado de conversa.

import { prisma } from "./prisma";
import { todayBRT, billDaysFor, autoEntryDates } from "./dates";
import type { Prisma } from "@prisma/client";
import { brlMsg as brl } from "./format";
import { NUMBER_PART, PAYMENT_OPTIONS, entryCard, parseBrNumber } from "./finance-text";
import type { QuotedChange } from "./finance-history";
import { FINANCE_TAXONOMY_DATA } from "./finance-taxonomy";

/** Acha o lançamento da mensagem citada: o cartão "📝 … 💰 R$ …", a nota salva, ou a mensagem original dele. */
export async function entryFromQuoted(quoted: string) {
  const q = quoted.trim();
  const desc = q.match(/^📝\s*(.+)$/m)?.[1]?.trim();
  const val = q.match(/💰\s*R\$\s*([\d.,]+)/)?.[1] ?? q.match(/Nota fiscal de R\$\s*([\d.,]+)/i)?.[1];
  if (val) {
    const amount = parseBrNumber(val);
    const isNota = /Nota fiscal de R\$/i.test(q) && !desc;
    const found = await prisma.financeEntry.findFirst({
      where: {
        amount: { gte: amount - 0.01, lte: amount + 0.01 },
        ...(isNota ? { description: { startsWith: "Nota Fiscal" } } : desc ? { OR: [{ description: desc }, { description: "", category: desc }] } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (found) return found;
  }
  // Respondeu à própria mensagem ("almoço 25"): o histórico sabe o que ela criou.
  const log = await prisma.financeLog.findFirst({ where: { action: "create", reason: { startsWith: `mensagem: "${q.slice(0, 60)}` } }, orderBy: { at: "desc" } });
  return log?.entryId ? prisma.financeEntry.findUnique({ where: { id: log.entryId } }) : null;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** "era besteira", "categoria saídas", "muda pra bar" → categoria (e subcategoria) da lista; só o nome exato, para não pegar "era 25". */
function categoryInText(t: string): QuotedChange | null {
  const m = t.match(/^(?:era|é|e|foi|categoria|muda(?:r)? (?:para|pra)|passa(?:r)? (?:para|pra)|coloca(?:r)? em)\s+(?:(?:de|em|na|no|pra|para)\s+)?(.+?)[.!]?$/);
  if (!m) return null;
  const want = fold(m[1]);
  for (const [category, subs] of Object.entries(FINANCE_TAXONOMY_DATA.expense)) {
    if (fold(category) === want) return { category, subcategory: subs.length === 1 ? subs[0] : "" };
    const sub = subs.find((s) => fold(s) === want || fold(s).split("/").includes(want));
    if (sub) return { category, subcategory: sub };
  }
  return null;
}

/** "foi no pix", "era 32,50", "foi dia 15/10", "foi ontem", "apaga" → mudança; null se não entendeu. */
export function parseQuotedChange(text: string): QuotedChange | null {
  const t = text.trim().toLowerCase();
  if (/^(apag[ae]|exclu[ia]|remov[ae]|desfaz(er)?|cancel[ae])\b/.test(t)) return { remove: true };
  const cat = categoryInText(t);
  if (cat) return cat;
  const c: QuotedChange = {};
  const pm = t.match(/\b(pix|d[eé]bito|dinheiro|esp[eé]cie|boleto|cart[aã]o|cr[eé]dito|vr|va|vale|ticket)\b/);
  if (pm) c.paymentMethod = PAYMENT_OPTIONS[pm[1].normalize("NFD").replace(/[̀-ͯ]/g, "")] ?? PAYMENT_OPTIONS[pm[1]] ?? (pm[1] === "boleto" ? "boleto" : undefined);
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  const hj = todayBRT();
  if (dm) {
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : hj.getFullYear();
    c.purchase = new Date(y, Number(dm[2]) - 1, Number(dm[1]), 12).toISOString();
  } else if (/\bontem\b/.test(t)) c.purchase = new Date(hj.getFullYear(), hj.getMonth(), hj.getDate() - 1, 12).toISOString();
  else if (/\bhoje\b/.test(t)) c.purchase = hj.toISOString();
  const am = (dm ? t.replace(dm[0], " ") : t).match(new RegExp(String.raw`(?:^|\b(?:foi|era|é|deu|custou|valor|na verdade)\s+(?:de\s+)?)(?:r\$\s*)?${NUMBER_PART}(?:\s*(?:reais|conto))?\b`, "i"));
  if (am) { const v = parseBrNumber(am[1]); if (v > 0) c.amount = v; }
  return Object.keys(c).length ? c : null;
}

/** "apaga almoço 32" / "almoço 32 apaga" → valor e nome; null se não for pedido de apagar com valor. */
export function parseDeleteText(text: string): { amount: number; name: string } | null {
  const t = text.trim();
  const verb = /\b(apag[ae]r?|exclu[ia]r?|remov[ae]r?)\b/i;
  const num = t.match(new RegExp(NUMBER_PART));
  if (t.length > 60 || !verb.test(t) || !num) return null;
  const name = t.replace(verb, " ").replace(num[0], " ").replace(/(?<!\p{L})(r\$|reais|o|a|de|do|da|esse|este)(?!\p{L})/giu, " ").replace(/\s+/g, " ").trim();
  return { amount: parseBrNumber(num[1]), name };
}

/** "você anotou o gasto de 85,55?" é pergunta: procura o lançamento, nunca lança (27/08 virou gasto novo). */
export function parseDidLogText(text: string): number | null {
  const t = text.trim();
  if (t.length > 80 || !/\?\s*$/.test(t) || !/\b(anotou|lan[cç]ou|registrou|salvou|guardou)\b/i.test(t)) return null;
  // Chamado, senha e chave seguem para os comandos próprios (dado do trabalho não vai para a conversa).
  if (/\b(chamado|senha|chave|token|processo)\b/i.test(t)) return null;
  const num = t.match(new RegExp(String.raw`(?<![\w.,-])${NUMBER_PART}(?![\w-])`));
  const v = num ? parseBrNumber(num[1]) : NaN;
  return v > 0 && v < 100000 ? v : null;
}

/** "o cupom de 56,38 de 31/10 era vr" sem citar → valor, dia (se disse) e a mudança (meio ou categoria).
 *  "era" sempre é correção; "foi" só com data ("almoço 32 foi no pix" é gasto novo). */
export function parseEditText(text: string): { amount: number; day: Date | null; change: QuotedChange } | null {
  const t = text.trim().toLowerCase();
  const m = t.match(/\b(era|eram|foi|foram)\s+((?:(?:no|na|em|de|pelo|pela|pra|para)\s+)?[\p{L}/]+)[.!]?$/u);
  if (t.length > 90 || !m) return null;
  const change = parseQuotedChange(`era ${m[2]}`);
  if (!change || !(change.paymentMethod || change.category)) return null;
  const head = t.slice(0, m.index);
  const dm = head.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (/^f/.test(m[1]) && !dm) return null;
  const num = (dm ? head.replace(dm[0], " ") : head).match(new RegExp(NUMBER_PART));
  if (!num) return null;
  const y = dm?.[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : todayBRT().getFullYear();
  return { amount: parseBrNumber(num[1]), day: dm ? new Date(y, Number(dm[2]) - 1, Number(dm[1]), 12) : null, change };
}

export async function applyQuotedEdit(entryId: string, c: QuotedChange): Promise<string> {
  const e = await prisma.financeEntry.findUnique({ where: { id: entryId } });
  if (!e) return "Esse lançamento não existe mais.";
  const label = e.description || e.category;
  if (c.remove) {
    await prisma.financeEntry.delete({ where: { id: e.id } });
    return `🗑️ Apaguei "${label}" (${brl(e.amount)}). Errou? Peça "histórico do ${label.slice(0, 30)}" e "desfaz a mudança 1".`;
  }
  const data: Prisma.FinanceEntryUpdateInput = {};
  if (c.amount != null) data.amount = c.amount;
  if (c.category) Object.assign(data, { category: c.category, subcategory: c.subcategory ?? "" });
  const method = c.paymentMethod ?? e.paymentMethod;
  if (c.paymentMethod || c.purchase) {
    const purchase = c.purchase ? new Date(c.purchase) : e.purchaseDate ?? e.date;
    const config = await prisma.agentConfig.findFirst({ select: { creditCardDueDay: true, creditCardBestDay: true, cardBillDays: true } });
    const d = billDaysFor(config, e.card);
    const auto = autoEntryDates({ type: e.type, paymentMethod: method, date: method === "cartão" && e.type === "expense" ? null : purchase.toISOString(), purchaseDate: purchase.toISOString(), description: e.description }, d.due, d.best);
    Object.assign(data, { paymentMethod: method, date: auto.date, purchaseDate: auto.purchaseDate ?? purchase, status: auto.status });
    if (c.paymentMethod) data.account = method === "ticket" ? "VR" : /vr|ticket|vale/i.test(e.account) ? "Principal" : e.account;
  }
  const u = await prisma.financeEntry.update({ where: { id: e.id }, data });
  return entryCard(u, "✏️ Corrigido!");
}
