import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { scooterNumbers, CHARGER_EFF, TIRE_PSI } from "@/lib/scooter";

/** Dados da aba Scooter: números de agora + histórico de cargas e leituras. */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const [n, logs] = await Promise.all([scooterNumbers(), prisma.scooterLog.findMany({ orderBy: { at: "asc" } })]);
  if (!n) return NextResponse.json({ empty: true });

  // Cada carga com os km rodados desde a anterior e o consumo desse ciclo
  // (mesma conta do scooterNumbers: a carga repõe o que os km gastaram).
  const charges = logs.filter((l) => l.kind === "carga");
  const cargas = charges.map((c, i) => {
    const prev = charges[i - 1];
    const km = prev && prev.odo != null && c.odo != null ? c.odo - prev.odo : null;
    const pico = c.note.match(/pico (\d+(?:[.,]\d+)?) W/)?.[1];
    return {
      at: c.at,
      kwh: c.kwh,
      hours: c.hours,
      odo: c.odo,
      km,
      whKm: km && km >= 5 && c.kwh != null ? (c.kwh * 1000 * CHARGER_EFF) / km : null,
      custo: c.kwh != null ? c.kwh * n.price : null,
      picoW: pico ? Number(pico.replace(",", ".")) : null,
      auto: /autom[aá]tico/i.test(c.note),
    };
  });

  const leituras = logs
    .filter((l) => l.kind === "leitura" || (l.kind === "carga" && l.odo != null))
    .filter((l) => l.odo != null)
    .map((l) => ({ at: l.at, odo: l.odo as number, volts: l.volts, bars: l.bars, carga: l.kind === "carga" }));

  // Média de km por dia, do primeiro ao último ODO conhecido.
  const first = leituras[0];
  const last = leituras.at(-1);
  const dias = first && last ? (last.at.getTime() - first.at.getTime()) / 86_400_000 : 0;
  const kmDia = first && last && dias >= 1 ? (last.odo - first.odo) / dias : null;

  // Economia vs Uber (pedido dele, 22/10/2026): dias ÚTEIS em que a scooter rodou
  // (o ODO subiu no intervalo) × 2 corridas (ida e volta) × o preço médio das
  // corridas de Uber que ele lançou − a energia das cargas. É estimativa.
  const uber = await prisma.financeEntry.aggregate({
    where: { type: "expense", amount: { lt: 60 }, OR: [{ subcategory: "Uber/Taxi" }, { description: { contains: "uber", mode: "insensitive" } }] },
    _avg: { amount: true },
    _count: true,
  });
  const corrida = uber._avg.amount ?? 0;
  // Dias úteis (seg–sex) depois de "de" até "ate", no dia de Brasília.
  const diaBrt = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const diasUteis = (de: Date, ate: Date) => {
    let n = 0;
    const fim = diaBrt(ate);
    for (let d = new Date(`${diaBrt(de)}T12:00:00Z`); ; ) {
      d.setUTCDate(d.getUTCDate() + 1);
      const k = d.toISOString().slice(0, 10);
      if (k > fim) break;
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++;
    }
    return n;
  };
  const mesAtual = diaBrt(new Date()).slice(0, 7);
  let diasRod = 0, diasMes = 0;
  for (let i = 1; i < leituras.length; i++) {
    if (leituras[i].odo <= leituras[i - 1].odo) continue;
    const n0 = Math.max(1, diasUteis(leituras[i - 1].at, leituras[i].at));
    diasRod += n0;
    if (diaBrt(leituras[i].at).slice(0, 7) === mesAtual) diasMes += n0;
  }
  const energiaTotal = charges.reduce((a, c) => a + (c.kwh ?? 0), 0) * n.price;
  const economia = corrida > 0 ? {
    corrida,
    corridasBase: uber._count,
    dias: diasRod,
    diasMes,
    total: diasRod * 2 * corrida - energiaTotal,
    mes: diasMes * 2 * corrida - n.mesKwh * n.price,
    uberMes: diasMes * 2 * corrida,
  } : null;

  // Quando recarregar: folga (km) ÷ km por dia → data prevista (pela média, inclui dias parados).
  const folga = n.kmSince != null ? n.safeKm - n.kmSince : null;
  const recarregarEm = folga != null && kmDia && kmDia > 0 ? new Date(Date.now() + Math.max(0, folga / kmDia) * 86_400_000) : null;
  // Parte na conta de luz: cargas por mês (média) ÷ última conta da Enel do histórico do ar.
  const st = (await prisma.flowState.findUnique({ where: { key: "smartthings" } }))?.value as { enel?: { ref: string; kwh: number; valor: number }[] } | null;
  const ultimaConta = st?.enel?.slice().sort((a, b) => a.ref.localeCompare(b.ref)).at(-1) ?? null;
  const mesesCarga = charges.length > 1 ? (charges.at(-1)!.at.getTime() - charges[0].at.getTime()) / (30.44 * 86_400_000) : null;
  const kwhMes = mesesCarga && mesesCarga >= 0.5 ? charges.reduce((a, c) => a + (c.kwh ?? 0), 0) / mesesCarga : null;

  return NextResponse.json({
    ...n,
    kmDia,
    recarregarEm,
    naConta: ultimaConta && kwhMes ? { kwhMes, pct: (kwhMes / ultimaConta.kwh) * 100, conta: ultimaConta.valor } : null,
    economia,
    tirePsi: TIRE_PSI,
    cargas: cargas.reverse(),
    leituras,
    pneus: logs.filter((l) => l.kind === "pneu").map((p) => ({ at: p.at, front: p.psiFront, rear: p.psiRear })).reverse(),
  });
});
