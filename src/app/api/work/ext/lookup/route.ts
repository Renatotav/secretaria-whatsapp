import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWorkToken } from "@/lib/work-auth";
import { normalizeTicketId } from "@/lib/work-privacy";
import { getSituations } from "@/lib/work-situations";

// Balão da extensão: dados dos chamados pedidos (escala + planilha + painel).
// Não devolve a descrição (o atendente já está vendo o chamado no Assyst).
// GET /api/work/ext/lookup?ids=1234567,R1234567  (até 300 por vez)
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const ids = (new URL(request.url).searchParams.get("ids") || "")
    .split(",")
    .map(normalizeTicketId)
    .filter((id) => /^[A-Z]?\d{6,9}$/.test(id))
    .slice(0, 300);
  if (ids.length === 0) {
    return NextResponse.json({ tickets: {}, situations: await getSituations() });
  }
  // Mesma regra de casamento da extensão: sem letra de um lado, compara só os dígitos.
  const digits = [...new Set(ids.map((id) => id.replace(/^[A-Z]/, "")))];
  const rows = await prisma.workTicket.findMany({
    where: { OR: digits.flatMap((d) => [{ ticketId: d }, { ticketId: { endsWith: d } }]) },
    select: { errorGroup: true, ticketId: true, status: true, errorType: true, origin: true, resolution: true, redmine: true, redmineStatus: true, queue: true, lastAction: true, receivedAt: true, slaOverride: true, sheetStatus: true, situation: true, situationSince: true, pausedMs: true, openedAt: true, resolvedAt: true, updatedAt: true },
  });
  const tickets: Record<string, unknown> = {};
  for (const id of ids) {
    const d = id.replace(/^[A-Z]/, "");
    const letter = /^[A-Z]/.test(id) ? id[0] : "";
    const hit =
      rows.find((r) => r.ticketId === id) ??
      rows.find((r) => r.ticketId.replace(/^[A-Z]/, "") === d && (!letter || !/^[A-Z]/.test(r.ticketId)));
    if (hit) tickets[id] = hit;
  }
  // Abertos ganham "como resolvi parecidos": 2 resolvidos do mesmo grupo de erro
  // (o artigo da base quando existe; senão a resolução), já sem dado pessoal.
  const grupos = [...new Set(Object.values(tickets).map((t) => t as { status: string; errorGroup: string }).filter((t) => (t.status === "aberto" || t.status === "pendente") && t.errorGroup && !["Sem grupo", "Outros"].includes(t.errorGroup)).map((t) => t.errorGroup))];
  const porGrupo: Record<string, { ticketId: string; texto: string }[]> = {};
  for (const g of grupos.slice(0, 10)) {
    const r = await prisma.workTicket.findMany({
      where: { errorGroup: g, status: { in: ["resolvido", "escalado"] }, resolution: { not: "" } },
      select: { ticketId: true, resolution: true, kbArticle: true },
      orderBy: { resolvedAt: "desc" },
      take: 2,
    });
    porGrupo[g] = r.map((x) => ({ ticketId: x.ticketId, texto: (x.kbArticle && x.kbArticle !== "-" ? x.kbArticle : x.resolution).slice(0, 300) }));
  }
  for (const [id, t] of Object.entries(tickets) as [string, { ticketId: string; status: string; errorGroup: string }][]) {
    const p = porGrupo[t.errorGroup]?.filter((x) => x.ticketId !== t.ticketId);
    if (p?.length && (t.status === "aberto" || t.status === "pendente")) (tickets[id] as Record<string, unknown>).parecidos = p;
  }
  return NextResponse.json({ tickets, situations: await getSituations() });
}
