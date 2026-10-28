// Metas de economia e a Reserva (conta corrente guardada): quanto falta por mês,
// se dá para cumprir e o saldo da Reserva agora. Saiu de message-handlers.ts
// (28/10/2026) — sem estado de conversa.

import { prisma } from "./prisma";
import { todayBRT } from "./dates";
import { brlMsg as brl } from "./format";
import { MONTH_NAMES, monthForecast } from "./finance-common";

/** Quanto guardar por mês para bater a meta no prazo (null sem prazo ou já batida). */
export function goalMonthlyNeed(g: { targetAmount: number; currentAmount: number; deadline: Date | null }) {
  if (!g.deadline || g.currentAmount >= g.targetAmount) return null;
  const today = todayBRT();
  const months = Math.max(1, (g.deadline.getFullYear() - today.getFullYear()) * 12 + g.deadline.getMonth() - today.getMonth());
  return { perMonth: (g.targetAmount - g.currentAmount) / months, until: `${String(g.deadline.getMonth() + 1).padStart(2, "0")}/${String(g.deadline.getFullYear()).slice(2)}` };
}

/** As metas cabem na sobra prevista do mês que vem? */
export async function goalsViabilityLine(goals: { targetAmount: number; currentAmount: number; deadline: Date | null; name: string }[]): Promise<string> {
  const total = goals.reduce((sum, g) => sum + (goalMonthlyNeed(g)?.perMonth ?? 0), 0);
  if (total <= 0) return "";
  const today = todayBRT();
  const next = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const forecast = await monthForecast(next.getFullYear(), next.getMonth());
  const month = MONTH_NAMES[next.getMonth()];
  return forecast >= total
    ? `\n\n🟢 As metas pedem ${brl(total)}/mês e cabem na sobra prevista de ${month} (${brl(forecast)}).`
    : `\n\n🔴 As metas pedem ${brl(total)}/mês, mas a sobra prevista de ${month} é ${brl(Math.max(0, forecast))}. Estique o prazo ou reduza o valor.`;
}

/** Acha a meta de reserva (nome com "reserva"), se existir. */
export async function findReserveGoal() {
  const goals = await prisma.savingsGoal.findMany({ orderBy: { createdAt: "asc" } });
  return goals.find((g) => /reserva/i.test(g.name)) ?? null;
}

/**
 * Reserva AGORA: o guardado + o resultado do mês corrente que já passou pela
 * conta corrente (só o pago; VR fora). Ele pediu que o desconto fosse na hora,
 * não só no fechamento do dia 1º. O fechamento continua gravando o mês inteiro
 * (e aí este "mês até agora" zera), sem descontar duas vezes.
 */
export async function reserveNow(reserve?: { currentAmount: number } | null): Promise<{ agora: number; mes: number } | null> {
  const r = reserve === undefined ? await findReserveGoal() : reserve;
  if (!r) return null;
  const brt = new Date(Date.now() - 3 * 3600_000);
  const y = brt.getUTCFullYear(), m = brt.getUTCMonth();
  const key = `${y}-${String(m + 1).padStart(2, "0")}`;
  const cfg = await prisma.agentConfig.findFirst({ select: { reserveSyncedMonth: true } });
  if (cfg && cfg.reserveSyncedMonth >= key) return { agora: r.currentAmount, mes: 0 };
  const entries = await prisma.financeEntry.findMany({
    where: {
      status: "paid",
      date: { gte: new Date(y, m, 1), lte: new Date(y, m + 1, 0, 23, 59, 59) },
      NOT: { OR: ["VR", "ticket", "vale"].map((w) => ({ account: { contains: w, mode: "insensitive" as const } })) },
    },
    select: { type: true, amount: true, paymentMethod: true },
  });
  const mes = Math.round(entries.filter((e) => e.paymentMethod !== "ticket").reduce((s, e) => s + (e.type === "income" ? e.amount : -e.amount), 0) * 100) / 100;
  return { agora: Math.max(0, Math.round((r.currentAmount + mes) * 100) / 100), mes };
}
