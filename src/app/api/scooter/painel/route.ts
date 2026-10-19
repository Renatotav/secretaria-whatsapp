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

  return NextResponse.json({
    ...n,
    kmDia,
    tirePsi: TIRE_PSI,
    cargas: cargas.reverse(),
    leituras,
    pneus: logs.filter((l) => l.kind === "pneu").map((p) => ({ at: p.at, front: p.psiFront, rear: p.psiRear })).reverse(),
  });
});
