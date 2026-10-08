import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWorkToken } from "@/lib/work-auth";
import { normalizeTicketId } from "@/lib/work-privacy";

// Balão da extensão: dados dos chamados pedidos (escala + planilha + painel).
// Não devolve a descrição (o atendente já está vendo o chamado no Assyst).
// GET /api/work/ext/lookup?ids=2154585,R2428333  (até 300 por vez)
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const ids = (new URL(request.url).searchParams.get("ids") || "")
    .split(",")
    .map(normalizeTicketId)
    .filter((id) => /^[A-Z]?\d{6,9}$/.test(id))
    .slice(0, 300);
  if (ids.length === 0) return NextResponse.json({ tickets: {} });
  // Mesma regra de casamento da extensão: sem letra de um lado, compara só os dígitos.
  const digits = [...new Set(ids.map((id) => id.replace(/^[A-Z]/, "")))];
  const rows = await prisma.workTicket.findMany({
    where: { OR: digits.flatMap((d) => [{ ticketId: d }, { ticketId: { endsWith: d } }]) },
    select: { ticketId: true, status: true, errorType: true, origin: true, resolution: true, redmine: true, redmineStatus: true, openedAt: true, resolvedAt: true, source: true, updatedAt: true },
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
  return NextResponse.json({ tickets });
}
