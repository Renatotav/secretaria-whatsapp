// Lista de desejos: "posso comprar?" pela previsão do mês, o selo de cada desejo
// e a lista. Saiu de message-handlers.ts (28/10/2026) — sem estado de conversa.

import { prisma } from "./prisma";
import { todayBRT, creditCardBillDate } from "./dates";
import { brlMsg as brl } from "./format";
import { MONTH_NAMES, budgetStatus } from "./finance-common";
import { monthForecast } from "./finance-common";

// ── Lista de desejos ────────────────────────────────────────────────────
export interface WishVerdict {
  level: "green" | "yellow" | "red";
  text: string;
}

/**
 * Um desejo cabe agora? Mesma conta do "posso comprar?": previsão de cada mês
 * em que cai uma parcela (entra − sai − o que ainda vem pelos tetos) e o teto
 * da categoria no primeiro mês.
 */
export async function checkWish(w: { amount: number; installments: number; paymentMethod: string; category: string }): Promise<WishVerdict> {
  const config = await prisma.agentConfig.findFirst();
  const today = todayBRT();
  const isCard = w.paymentMethod === "cartão";
  const n = isCard ? Math.max(1, w.installments || 1) : 1;
  const parcel = w.amount / n;
  const first = isCard ? creditCardBillDate(today, config?.creditCardDueDay || 10, config?.creditCardBestDay || 5) : today;
  let worst = Infinity;
  let worstMonth = "";
  for (let k = 0; k < n; k++) {
    const d = new Date(first.getFullYear(), first.getMonth() + k, 1);
    const after = (await monthForecast(d.getFullYear(), d.getMonth())) - parcel;
    if (after < worst) { worst = after; worstMonth = MONTH_NAMES[d.getMonth()]; }
  }
  const { items } = await budgetStatus(first.getFullYear(), first.getMonth());
  const b = items.find((x) => x.category === w.category);
  const over = b ? b.spent + parcel - b.limit : -1;
  if (worst < 0) return { level: "red", text: `ainda não: ${worstMonth} ficaria ${brl(-worst)} no vermelho` };
  if (over > 0) return { level: "yellow", text: `cabe no mês, mas estoura o teto de ${b!.category} em ${brl(over)}` };
  if (worst < 150) return { level: "yellow", text: `cabe, mas aperta ${worstMonth} (sobra só ${brl(worst)})` };
  return { level: "green", text: `cabe! ${worstMonth} ainda sobra ${brl(worst)} depois da compra` };
}

export const wishLabel = (w: { name: string; amount: number; installments: number; paymentMethod: string }) =>
  `${w.name} — ${brl(w.amount)}${w.paymentMethod === "cartão" && w.installments > 1 ? ` (${w.installments}× de ${brl(w.amount / w.installments)})` : ` (${w.paymentMethod})`}`;

export const levelIcon = { green: "🟢", yellow: "🟡", red: "🔴" } as const;

export async function buildWishList(): Promise<string> {
  const wishes = await prisma.wishItem.findMany({ where: { status: "wish" }, orderBy: { createdAt: "asc" } });
  if (wishes.length === 0) return "🛍️ Sua lista de desejos está vazia. Ex: \"quero comprar um tênis de 300 em 3x\".";
  const lines: string[] = [];
  for (const w of wishes) {
    const v = await checkWish(w);
    lines.push(`${levelIcon[v.level]} ${wishLabel(w)}\n   ${v.text}`);
  }
  return `🛍️ *Lista de desejos*\n${lines.join("\n")}`;
}
