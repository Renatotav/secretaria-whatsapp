import { prisma } from "./prisma";

// "posso sair hoje?" / "saídas?": quanto sobra no teto de Saídas do mês (bar,
// espetinho, festa) e como está o mês no geral. Sem IA, sem sermão.

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function applySaidasCommand(text: string): Promise<string | null> {
  const q = text.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
