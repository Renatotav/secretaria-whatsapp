import { prisma } from "./prisma";
import { alertsFor } from "./work-sla";

// Painel de Produtividade: clicar numa barra (grupo de erro, tipo ou origem)
// mostra o resumo daquele recorte no mês — só banco, sem IA — e como ele
// resolveu esse mesmo tipo de erro das outras vezes (base de conhecimento).

const DAY = 86400_000;
export type Recorte = "grupo" | "tipo" | "origem";

function inicioDoMes(): Date {
  const brt = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), 1, 3));
}

/** Os rótulos do gráfico que não são valor de campo ("Fora da planilha", "Requisição…"). */
function filtroDe(recorte: Recorte, valor: string) {
  if (recorte === "grupo") return { errorGroup: valor };
  if (recorte === "origem") return valor === "(sem)" ? { origin: "" } : { origin: valor };
  if (valor === "Requisição/serviço (R/S)") return { errorType: "", ticketId: { startsWith: "R" } };
  if (valor === "Fora da planilha") return { errorType: "" };
  return { errorType: valor };
}

export async function insight(recorte: Recorte, valor: string) {
  const mes = inicioDoMes();
  const doMes = { OR: [{ openedAt: { gte: mes } }, { openedAt: null, createdAt: { gte: mes } }, { resolvedAt: { gte: mes } }] };
  let rows = await prisma.workTicket.findMany({
    where: { AND: [doMes, filtroDe(recorte, valor)] },
    select: { ticketId: true, status: true, errorType: true, errorGroup: true, origin: true, redmine: true, redmineStatus: true, openedAt: true, receivedAt: true, resolvedAt: true, createdAt: true, queue: true, lastAction: true, slaOverride: true, situation: true, situationSince: true, pausedMs: true },
    orderBy: { openedAt: "desc" },
  });
  // "Requisição/serviço": R… e S…; "Fora da planilha": o que não é R/S.
  if (recorte === "tipo" && valor === "Requisição/serviço (R/S)")
    rows = await prisma.workTicket.findMany({
      where: { AND: [doMes, { errorType: "" }, { OR: [{ ticketId: { startsWith: "R" } }, { ticketId: { startsWith: "S" } }] }] },
      select: { ticketId: true, status: true, errorType: true, errorGroup: true, origin: true, redmine: true, redmineStatus: true, openedAt: true, receivedAt: true, resolvedAt: true, createdAt: true, queue: true, lastAction: true, slaOverride: true, situation: true, situationSince: true, pausedMs: true },
      orderBy: { openedAt: "desc" },
    });
  if (recorte === "tipo" && valor === "Fora da planilha") rows = rows.filter((t) => !/^[RS]/i.test(t.ticketId));

  const fechados = rows.filter((t) => t.status === "resolvido" || t.status === "escalado");
  const comRedmine = rows.filter((t) => t.status === "escalado" || (t.redmine || "").trim());
  const tempos = fechados
    .map((t) => {
      const ini = t.receivedAt ?? t.openedAt;
      return ini && t.resolvedAt && t.resolvedAt > ini ? (t.resolvedAt.getTime() - ini.getTime()) / DAY : null;
    })
    .filter((x): x is number => x !== null);
  const tempoMedioDias = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;

  // Como resolveu das outras vezes (qualquer mês), as mais recentes primeiro.
  const resolucoes =
    recorte === "origem" || valor === "Fora da planilha" || valor.startsWith("Requisição")
      ? []
      : await prisma.workTicket.findMany({
          where: { ...filtroDe(recorte, valor), resolution: { not: "" } },
          select: { ticketId: true, resolution: true, kbArticle: true, errorType: true, resolvedAt: true },
          orderBy: { resolvedAt: "desc" },
          take: 3,
        });

  return {
    recorte,
    valor,
    criterio: `${recorte === "grupo" ? "grupo de erro" : recorte === "tipo" ? "tipo do erro" : "origem"} = "${valor}", chamados abertos ou fechados desde ${mes.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
    total: rows.length,
    fechados: fechados.length,
    abertos: rows.filter((t) => t.status === "aberto" || t.status === "pendente").length,
    redmine: comRedmine.length,
    tempoMedioDias,
    chamados: rows.slice(0, 40).map((t) => ({
      ticketId: t.ticketId,
      status: t.status,
      tipo: t.errorType,
      redmine: t.redmine,
      redmineStatus: t.redmineStatus,
      dias: alertsFor(t).days,
    })),
    // O artigo da base (Problema · Causa · Solução) quando já existe; senão a resolução.
    resolucoes: resolucoes.map((r) => ({ ticketId: r.ticketId, tipo: r.errorType, quando: r.resolvedAt, texto: (r.kbArticle && r.kbArticle !== "-" ? r.kbArticle : r.resolution || "").slice(0, 600) })),
  };
}
