import { withReason } from "./finance-reason";
import { prisma } from "./prisma";

// Previsões fixas (aluguel, salário, VR, luz, internet, academia, assinaturas…)
// sempre 12 meses à frente (pedido dele, 20/10/2026: elas acabavam em jul/ago
// de 2027 e os meses seguintes pareciam "sobrar dinheiro").
//
// Uma série = mesmos descrição, tipo, categoria, subcategoria, meio, conta e
// cartão, com "(previsto)" e sem "Parcela" (parcela tem fim certo). Só renova
// série viva: pelo menos 3 meses previstos daqui para a frente — quando ele
// cancela algo (apaga as previsões), ela para de renovar sozinha.

const MESES_A_FRENTE = 12;
const MIN_PREVISTOS = 3;

export async function rollForecasts(hoje = new Date()): Promise<{ series: number; criados: number }> {
  const previstos = await prisma.financeEntry.findMany({
    where: { status: "pending", description: { contains: "(previsto)" }, NOT: { description: { contains: "Parcela" } }, date: { gte: hoje } },
    orderBy: { date: "asc" },
  });
  const grupos = new Map<string, typeof previstos>();
  for (const e of previstos) {
    const k = [e.description, e.type, e.category, e.subcategory, e.paymentMethod, e.account, e.card].join("|");
    grupos.set(k, [...(grupos.get(k) ?? []), e]);
  }
  const limite = new Date(hoje.getFullYear(), hoje.getMonth() + MESES_A_FRENTE, 28);
  let series = 0, criados = 0;
  for (const lista of grupos.values()) {
    if (lista.length < MIN_PREVISTOS) continue;
    const ultimo = lista[lista.length - 1];
    const novos = [];
    for (let i = 1; ; i++) {
      const data = new Date(ultimo.date.getFullYear(), ultimo.date.getMonth() + i, 1, ultimo.date.getHours());
      if (data > limite) break;
      // Mesmo dia do mês (dia 31 em mês de 30 vira o último dia).
      data.setDate(Math.min(ultimo.date.getDate(), new Date(data.getFullYear(), data.getMonth() + 1, 0).getDate()));
      const compra = ultimo.purchaseDate ? new Date(ultimo.purchaseDate.getFullYear(), ultimo.purchaseDate.getMonth() + i, ultimo.purchaseDate.getDate(), ultimo.purchaseDate.getHours()) : null;
      novos.push({
        type: ultimo.type, amount: ultimo.amount, category: ultimo.category, subcategory: ultimo.subcategory, description: ultimo.description,
        date: data, purchaseDate: compra, paymentMethod: ultimo.paymentMethod, account: ultimo.account, card: ultimo.card,
        status: "pending", mood: "neutro", source: "forecast",
      });
    }
    if (!novos.length) continue;
    const dados = novos;
    await withReason("previsões (12 meses à frente)", () => prisma.financeEntry.createMany({ data: dados }));
    series++;
    criados += novos.length;
  }
  return { series, criados };
}
