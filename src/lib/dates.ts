/**
 * "2026-07-31" (data pura, sem hora) vira meia-noite UTC quando passada pro
 * construtor nativo de Date, o que em fusos negativos (ex: Brasil, UTC-3)
 * pode exibir/filtrar como o dia ANTERIOR — e até jogar o lançamento pro mês
 * errado se cair no dia 1. Extrai os componentes Y-M-D manualmente e monta a
 * data no fuso local do processo, tanto pra strings puras quanto pra ISO
 * completas (ignora a hora nesse caso).
 */
export function parseLocalDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(dateStr);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

/**
 * Data de hoje no horário de Brasília (UTC-3), ao meio-dia local do processo.
 * O container roda em UTC: sem isso, uma compra às 22h do dia 4 contaria
 * como dia 5 e iria pra fatura errada.
 */
export function todayBRT(): Date {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 12, 0, 0);
}

/**
 * Em qual vencimento cai uma compra no cartão. Compra antes do "melhor dia
 * de compra" entra na fatura que vence no dueDay seguinte; a partir dele, pula
 * pra fatura do mês depois. Ex. (vencimento 10, melhor dia 5): compra 02/10 →
 * 10/10; compra 05/10 → 10/11. Se o melhor dia vier depois do vencimento
 * (ex: vence 5, melhor dia 28), a fatura sempre vence no mês seguinte.
 */
export function creditCardBillDate(purchase: Date, dueDay = 10, bestDay = 5): Date {
  const monthOffset = (purchase.getDate() >= bestDay ? 1 : 0) + (bestDay > dueDay ? 1 : 0);
  const year = purchase.getFullYear();
  const month = purchase.getMonth() + monthOffset;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(dueDay, lastDay), 12, 0, 0);
}
