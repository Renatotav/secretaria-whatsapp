import { prisma } from "./prisma";
import { brl } from "./format";
import { budgetStatus, dayRange, monthForecastParts, spentBetween } from "./finance-common";
import { todayBRT } from "./dates";

// "posso sair hoje?" / "saídas?": quanto sobra no teto de Saídas do mês (bar,
// espetinho, festa) e como está o mês no geral. Sem IA, sem sermão.


export async function applySaidasCommand(text: string): Promise<string | null> {
  const q = text.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/^(?:posso|da\s+(?:pra|para))\s+gastar(?:\s+(?:hoje|agora|algo|alguma\s+coisa))?\s*\??$/.test(q)) return gastarHoje();
  if (!/^(?:posso\s+(?:sair|ir\s+(?:pro|para\s+o|ao)\s+bar)(?:\s+hoje)?|quanto\s+(?:sobra|tenho)\s+(?:pra|para)\s+(?:sair|saidas)|saidas)\s*\??$/.test(q)) return null;
  const brt = new Date(Date.now() - 3 * 3600_000);
  const mes = brt.toISOString().slice(0, 7);
  const ini = new Date(`${mes}-01T03:00:00Z`);
  const fim = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth() + 1, 1, 3));
  const teto = (await prisma.budget.findFirst({ where: { category: "Saídas", month: mes } })) ?? (await prisma.budget.findFirst({ where: { category: "Saídas", month: "default" } }));
  const gasto = (await prisma.financeEntry.aggregate({ _sum: { amount: true }, where: { type: "expense", category: "Saídas", purchaseDate: { gte: ini, lt: fim } } }))._sum.amount ?? 0;
  const linhas: string[] = [];
  if (teto) {
    const sobra = teto.amount - gasto;
    linhas.push(sobra > 0 ? `🎉 Saídas: ${brl(gasto)} de ${brl(teto.amount)} — sobra *${brl(sobra)}* este mês.` : `🎉 Saídas: ${brl(gasto)} de ${brl(teto.amount)} — o teto do mês já foi (${brl(-sobra)} acima).`);
  } else linhas.push(`🎉 Saídas no mês: ${brl(gasto)} (sem teto definido).`);
  try {
    const { cardLimitLine } = await import("./message-handlers");
    const l = await cardLimitLine();
    if (l) linhas.push(l);
  } catch {}
  return linhas.join("\n");
}

// "posso gastar hoje?" (04/11/2026): a IA respondia com frase solta; aqui é a conta
// exata — quanto cabe por dia em cada teto até o fim do mês e como o mês fecha.
async function gastarHoje(): Promise<string> {
  const brt = new Date(Date.now() - 3 * 3600_000);
  const y = brt.getUTCFullYear(), m = brt.getUTCMonth();
  const diasRestam = new Date(Date.UTC(y, m + 1, 0)).getUTCDate() - brt.getUTCDate() + 1;
  const [{ items }, prev, hoje] = await Promise.all([
    budgetStatus(y, m),
    monthForecastParts(y, m),
    (({ gte, lte }) => spentBetween(gte, lte))(dayRange(todayBRT())),
  ]);
  const gastoHoje = hoje.reduce((a, e) => a + e.amount, 0);
  const linhas = [`💸 *Hoje* você já gastou ${brl(gastoHoje)}. Faltam ${diasRestam} dia(s) no mês.`];
  const tetos = items.filter((b) => ["Alimentação", "Besteira", "Saídas"].includes(b.category));
  for (const b of tetos) {
    const sobra = b.limit - b.spent;
    linhas.push(sobra > 0
      ? `🟢 ${b.category}: cabe ${brl(sobra / diasRestam)} por dia (sobra ${brl(sobra)})`
      : `🔴 ${b.category}: teto já foi (${brl(-sobra)} acima)`);
  }
  linhas.push(prev.total >= 0
    ? `📅 O mês fecha com ${brl(prev.total)} sobrando, já contando os tetos.`
    : `📅 O mês já fecha ${brl(-prev.total)} no vermelho: gasto fora dos tetos aumenta isso.`);
  return linhas.join("\n");
}
