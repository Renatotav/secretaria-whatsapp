import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

/**
 * Aba Parcelas (pedido dele, 22/10/2026): cada compra parcelada (nome, parcela
 * atual, quanto falta, quando acaba) e quanto as parcelas pesam em cada mês dos
 * próximos 12 — para ver quando sobra mais.
 */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const rows = await prisma.financeEntry.findMany({
    where: { type: "expense", description: { contains: "Parcela " } },
    select: { description: true, amount: true, date: true, status: true, category: true, card: true },
    orderBy: { date: "asc" },
  });
  type Serie = { nome: string; total: number; categoria: string; cartao: string; pagas: number; parcelas: { n: number; valor: number; mes: string; paga: boolean }[] };
  const series = new Map<string, Serie>();
  for (const r of rows) {
    const m = r.description.match(/^(.*?)\s*-?\s*Parcela (\d+)\/(\d+)/);
    if (!m) continue;
    const nome = m[1].replace(/\s*\(compra em [^)]*\)/, "").trim();
    const total = Number(m[3]);
    const k = `${nome}|${total}|${r.card}`;
    const s = series.get(k) ?? { nome, total, categoria: r.category, cartao: r.card, pagas: 0, parcelas: [] };
    const mes = `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
    if (!s.parcelas.some((p) => p.n === Number(m[2]))) {
      s.parcelas.push({ n: Number(m[2]), valor: r.amount, mes, paga: r.status === "paid" });
      if (r.status === "paid") s.pagas++;
    }
    series.set(k, s);
  }
  const hoje = new Date(Date.now() - 3 * 3600_000);
  const lista = [...series.values()]
    .map((s) => {
      const abertas = s.parcelas.filter((p) => !p.paga);
      const ultima = s.parcelas.reduce((a, p) => (p.mes > a ? p.mes : a), "");
      return {
        nome: s.nome,
        categoria: s.categoria,
        cartao: s.cartao,
        total: s.total,
        valor: s.parcelas[s.parcelas.length - 1]?.valor ?? 0,
        proxima: abertas.reduce((a, p) => Math.min(a, p.n), Infinity),
        proximaMes: abertas.reduce((a, p) => (p.mes < a ? p.mes : a), "9999-99"),
        faltam: abertas.length,
        restante: abertas.reduce((a, p) => a + p.valor, 0),
        ultima,
      };
    })
    .filter((s) => s.faltam > 0)
    .sort((a, b) => a.ultima.localeCompare(b.ultima));
  // Peso das parcelas nos próximos 12 meses.
  const meses: { mes: string; total: number; acabam: string[] }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + i, 1));
    const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    let total = 0;
    const acabam: string[] = [];
    for (const s of series.values()) {
      for (const p of s.parcelas) if (p.mes === mes && !p.paga) total += p.valor;
      if (s.parcelas.some((p) => p.mes === mes && p.n === s.total)) acabam.push(s.nome);
    }
    meses.push({ mes, total: Math.round(total * 100) / 100, acabam });
  }
  // Sem os meses do começo que já estão pagos (ex.: outubro), o gráfico começa na próxima fatura.
  while (meses.length && meses[0].total === 0) meses.shift();
  return NextResponse.json({ series: lista, meses });
});
