import { prisma } from "./prisma";
import { alertsFor } from "./work-sla";

// Relatório da semana do trabalho (segunda, logo depois do briefing das 8h).
// Só banco, sem IA: o que fechou, o que chegou, tempo médio, o que mais se
// repetiu (com a variação da semana anterior) e o que ficou parado.

const DAY = 86400_000;
const fmtDia = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(5, 10).split("-").reverse().join("/");
const tempo = (d: number | null) => (d === null ? "—" : d < 2 ? `${Math.round(d * 24)} h` : `${d.toFixed(1).replace(".", ",")} dias`);
const seta = (agora: number, antes: number) => (agora > antes ? `↑ ${antes}` : agora < antes ? `↓ ${antes}` : "=");

/** Segunda 00:00 (Brasília) da semana passada e da retrasada, em UTC. */
function semanas() {
  const brt = new Date(Date.now() - 3 * 3600_000);
  const hoje = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3));
  const estaSegunda = new Date(hoje.getTime() - ((brt.getUTCDay() + 6) % 7) * DAY);
  const passada = new Date(estaSegunda.getTime() - 7 * DAY);
  const retrasada = new Date(passada.getTime() - 7 * DAY);
  return { retrasada, passada, estaSegunda };
}

async function numerosDa(de: Date, ate: Date) {
  const fechados = await prisma.workTicket.findMany({
    where: { status: { in: ["resolvido", "escalado"] }, resolvedAt: { gte: de, lt: ate } },
    select: { status: true, redmine: true, errorGroup: true, receivedAt: true, openedAt: true, resolvedAt: true },
  });
  const chegaram = await prisma.workTicket.count({
    where: { OR: [{ receivedAt: { gte: de, lt: ate } }, { receivedAt: null, openedAt: { gte: de, lt: ate } }] },
  });
  const tempos = fechados
    .map((t) => {
      const ini = t.receivedAt ?? t.openedAt;
      return ini && t.resolvedAt && t.resolvedAt > ini ? (t.resolvedAt.getTime() - ini.getTime()) / DAY : null;
    })
    .filter((x): x is number => x !== null);
  const grupos: Record<string, number> = {};
  for (const t of fechados) if (t.errorGroup && t.errorGroup !== "Sem grupo") grupos[t.errorGroup] = (grupos[t.errorGroup] || 0) + 1;
  return {
    fechados: fechados.length,
    redmine: fechados.filter((t) => t.status === "escalado" || (t.redmine || "").trim()).length,
    chegaram,
    // Mediana: um chamado antigo fechado de uma vez não distorce o "típico".
    tempoMedio: tempos.length ? [...tempos].sort((a, b) => a - b)[Math.floor((tempos.length - 1) / 2)] : null,
    grupos,
  };
}

export async function buildWeeklyWorkReport(): Promise<string> {
  const { retrasada, passada, estaSegunda } = semanas();
  const [s, a] = await Promise.all([numerosDa(passada, estaSegunda), numerosDa(retrasada, passada)]);
  if (!s.fechados && !s.chegaram) return "";

  const { getSituations } = await import("./work-situations");
  const situacoes = await getSituations();
  const abertos = await prisma.workTicket.findMany({ where: { status: { in: ["aberto", "pendente"] } } });
  const parados = abertos
    .map((t) => ({ id: t.ticketId, al: alertsFor(t, situacoes) }))
    .filter((x) => x.al.overdue)
    .sort((x, y) => (y.al.days ?? 0) - (x.al.days ?? 0));

  const topGrupos = Object.entries(s.grupos)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([g, n]) => {
      const antes = a.grupos[g] || 0;
      return `${g} ${n}${n !== antes ? ` (${n > antes ? "+" : ""}${n - antes})` : ""}`;
    });
  const melhorou = s.tempoMedio !== null && a.tempoMedio !== null ? (s.tempoMedio < a.tempoMedio ? " — mais rápido 👏" : s.tempoMedio > a.tempoMedio ? " — mais lento" : "") : "";

  return [
    `📊 *Sua semana no trabalho* (${fmtDia(passada)} a ${fmtDia(new Date(estaSegunda.getTime() - DAY))})`,
    `✅ ${s.fechados} fechado(s): ${s.fechados - s.redmine} resolvido(s) · ${s.redmine} com Redmine — semana anterior: ${seta(s.fechados, a.fechados)}`,
    `📥 ${s.chegaram} chegaram — antes: ${a.chegaram}`,
    `⏱️ Tempo típico até fechar (mediana): ${tempo(s.tempoMedio)}${a.tempoMedio !== null ? ` (antes ${tempo(a.tempoMedio)})` : ""}${melhorou}`,
    topGrupos.length ? `🗂️ O que mais apareceu: ${topGrupos.join(" · ")}` : "",
    parados.length ? `⚠️ ${parados.length} parado(s) além do prazo: ${parados.slice(0, 6).map((x) => `${x.id} (${x.al.days}d)`).join(", ")}` : "👌 Nenhum chamado parado além do prazo.",
    `📂 ${abertos.length} em aberto agora.`,
  ]
    .filter(Boolean)
    .join("\n");
}
