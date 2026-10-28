// Histórico de mudanças do financeiro (FinanceLog): a linha de cada mudança, o que
// mudou numa correção e o "desfazer". Saiu de message-handlers.ts (28/10/2026) —
// sem estado de conversa.

import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { brlMsg as brl } from "./format";
import { formatDayMonth } from "./finance-common";
import { PAYMENT_NAMES, formatFullDate } from "./finance-text";

export const HIST_FIELDS = ["amount", "date", "purchaseDate", "status", "description", "category", "subcategory", "paymentMethod", "account", "card", "type"] as const;

export const HIST_LABEL: Record<string, string> = { amount: "valor", date: "data", purchaseDate: "data da compra", status: "situação", description: "nome", category: "categoria", subcategory: "subcategoria", paymentMethod: "pagamento", account: "conta", card: "cartão", type: "tipo" };

export function histValue(field: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (field === "amount") return brl(Number(v));
  if (field === "date" || field === "purchaseDate") { const d = new Date(String(v)); return formatDayMonth(new Date(d.getTime() - 3 * 3600_000 + 12 * 3600_000)); }
  if (field === "status") return v === "paid" ? "pago" : "a pagar";
  if (field === "type") return v === "income" ? "entrada" : "saída";
  return String(v);
}

export function histLine(n: number, l: { at: Date; action: string; description: string; before: unknown; after: unknown; reason: string }): string {
  const quando = new Date(l.at.getTime() - 3 * 3600_000).toISOString().slice(5, 16).replace(/(\d\d)-(\d\d)T/, "$2/$1 ");
  const b = (l.before ?? {}) as Record<string, unknown>, a = (l.after ?? {}) as Record<string, unknown>;
  let what: string;
  if (l.action === "create") what = `➕ criado: ${l.description} — ${histValue("amount", a.amount)} (${histValue("date", a.date)})`;
  else if (l.action === "delete") what = `🗑️ apagado: ${l.description} — ${histValue("amount", b.amount)} (${histValue("date", b.date)})`;
  else {
    const diffs = HIST_FIELDS.filter((f) => histValue(f, b[f]) !== histValue(f, a[f])).map((f) => `${HIST_LABEL[f]} ${histValue(f, b[f])} → ${histValue(f, a[f])}`);
    what = `✏️ ${l.description}: ${diffs.length ? diffs.join("; ") : "sem mudança visível"}`;
  }
  return `*${n}.* ${quando} · ${what}\n   ↳ motivo: ${l.reason || "não registrado"}`;
}

/** Volta uma linha do histórico: alteração → valores de antes; criação → apaga; exclusão → recria. */
export async function undoFinanceLog(logId: string): Promise<string> {
  const l = await prisma.financeLog.findUnique({ where: { id: logId } });
  if (!l) return "Essa mudança não existe mais.";
  const b = (l.before ?? {}) as Record<string, unknown>;
  const asData = (src: Record<string, unknown>) => {
    const d: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) d[k] = (k === "date" || k === "purchaseDate" || k === "createdAt" || k === "updatedAt") && typeof v === "string" ? new Date(v) : v;
    return d;
  };
  const atual = l.entryId ? await prisma.financeEntry.findUnique({ where: { id: l.entryId } }) : null;
  if (l.action === "create") {
    if (!atual) return `"${l.description}" já não existe — nada a desfazer.`;
    await prisma.financeEntry.delete({ where: { id: atual.id } });
    return `↩️ Apaguei "${atual.description}" (${brl(atual.amount)}), criado nessa mudança.`;
  }
  if (l.action === "delete") {
    if (atual) return `"${l.description}" já existe de novo — nada a desfazer.`;
    await prisma.financeEntry.create({ data: asData(b) as Prisma.FinanceEntryUncheckedCreateInput });
    return `↩️ Recriei "${l.description}" (${histValue("amount", b.amount)}, ${histValue("date", b.date)}).${/nota|invoice/i.test(String(b.source ?? "")) ? " Os itens da nota não voltam." : ""}`;
  }
  if (!atual) return `"${l.description}" foi apagado depois — não dá para voltar essa alteração.`;
  const volta: Record<string, unknown> = {};
  for (const f of HIST_FIELDS) if (f in b) volta[f] = b[f];
  await prisma.financeEntry.update({ where: { id: atual.id }, data: asData(volta) });
  return `↩️ "${atual.description}" voltou ao que era: ${histValue("amount", b.amount)}, ${histValue("date", b.date)}, ${histValue("status", b.status)}.`;
}

// ── Corrigir respondendo à mensagem antiga e pagamento dividido ─────────────
// Ele responde (cita) o cartão de um lançamento de semanas atrás com "foi no
// pix", "era 32,50", "foi dia 15/10" ou "apaga": a secretária acha aquele
// lançamento, mostra a mudança e espera o "sim". "100 no VR e 80 no cartão"
// (respondendo à nota, na legenda da foto ou logo depois dela) divide a compra
// em um lançamento por forma de pagamento, sem duplicar o total.
export type QuotedChange = { amount?: number; paymentMethod?: string; purchase?: string; remove?: boolean };

export function describeChange(e: { amount: number; paymentMethod: string; purchaseDate: Date | null; date: Date }, c: QuotedChange): string {
  if (c.remove) return "apagar este lançamento";
  const ps: string[] = [];
  if (c.amount != null && Math.abs(c.amount - e.amount) > 0.001) ps.push(`valor ${brl(e.amount)} → ${brl(c.amount)}`);
  if (c.paymentMethod && c.paymentMethod !== e.paymentMethod) ps.push(`pagamento ${PAYMENT_NAMES[e.paymentMethod] ?? e.paymentMethod} → ${PAYMENT_NAMES[c.paymentMethod] ?? c.paymentMethod}`);
  if (c.purchase) ps.push(`data da compra ${formatFullDate(e.purchaseDate ?? e.date)} → ${formatFullDate(new Date(c.purchase))}`);
  return ps.join("; ");
}
