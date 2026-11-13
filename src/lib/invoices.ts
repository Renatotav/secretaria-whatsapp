import { prisma } from "./prisma";
import { todayBRT } from "./dates";

// Faturas de cartão = compras no cartão ainda a pagar, agrupadas por cartão
// (campo "card": vazio = o cartão do dono; ex: "Santander do Bruno") e por
// vencimento. Pagar a fatura dá baixa em todas as compras dela de uma vez —
// antes era uma por uma (ou esperar a baixa automática no dia do vencimento).
// Estorno/reembolso no cartão (type "income") desconta da fatura.

export interface OpenInvoice {
  card: string;
  /** Vencimento (YYYY-MM-DD). */
  dueDate: string;
  total: number;
  count: number;
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function invoiceLabel(card: string): string {
  return card ? `Cartão ${card}` : "Seu cartão";
}

/** Faturas em aberto a partir do mês atual, da mais próxima para a mais distante. */
export async function listOpenInvoices(): Promise<OpenInvoice[]> {
  // Dia de Brasília: das 21h às 24h do último dia do mês o relógio UTC já está no mês seguinte.
  const today = todayBRT();
  const entries = await prisma.financeEntry.findMany({
    where: {
      status: "pending",
      paymentMethod: "cartão",
      date: { gte: new Date(today.getFullYear(), today.getMonth(), 1) },
    },
    select: { card: true, date: true, amount: true, type: true },
    orderBy: { date: "asc" },
  });
  const map = new Map<string, OpenInvoice>();
  for (const e of entries) {
    const dueDate = dayKey(e.date);
    const key = `${e.card}|${dueDate}`;
    const inv = map.get(key) ?? { card: e.card, dueDate, total: 0, count: 0 };
    if (e.type === "income") {
      inv.total -= e.amount; // estorno abate da fatura
    } else {
      inv.total += e.amount;
      inv.count++;
    }
    map.set(key, inv);
  }
  return [...map.values()];
}

/** Marca como pagas todas as compras de uma fatura. Devolve os ids (para "desfazer"). */
export async function payInvoice(card: string, dueDate: string): Promise<{ ids: string[]; total: number }> {
  const [y, m, d] = dueDate.split("-").map(Number);
  const entries = await prisma.financeEntry.findMany({
    where: {
      status: "pending",
      paymentMethod: "cartão",
      card,
      date: { gte: new Date(y, m - 1, d), lte: new Date(y, m - 1, d, 23, 59, 59) },
    },
    select: { id: true, amount: true, type: true },
  });
  const ids = entries.map((e) => e.id);
  if (ids.length) await prisma.financeEntry.updateMany({ where: { id: { in: ids } }, data: { status: "paid" } });
  return { ids, total: entries.reduce((s, e) => s + (e.type === "income" ? -e.amount : e.amount), 0) };
}

/**
 * Qual fatura o "paguei a fatura" quer dizer. Cartão citado → a mais próxima dele. Sem cartão
 * citado → a que vence primeiro, de qualquer cartão (13/11: o lembrete era do Santander de 15/11
 * e a baixa caiu no C6 de 10/12). Duas vencendo no mesmo dia, de cartões diferentes → null (perguntar).
 */
export function escolherFatura(open: OpenInvoice[], card: string | null): OpenInvoice | null | "ambigua" {
  const lista = [...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (card !== null) return lista.find((i) => i.card === card) ?? null;
  const [primeira, segunda] = lista;
  if (!primeira) return null;
  if (segunda && segunda.dueDate === primeira.dueDate && segunda.card !== primeira.card) return "ambigua";
  return primeira;
}
