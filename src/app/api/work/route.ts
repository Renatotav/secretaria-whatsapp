import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { CAN_CLOSE_WHERE, upsertWorkTicket, workStats } from "@/lib/work";
import { alertsFor } from "@/lib/work-sla";

// Painel "Trabalho" (protegido pelo login do painel).
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toUpperCase();
  // Filtros dos cartões (igual ao escala): urgentes, Redmine resolvido, atrasados.
  const f = searchParams.get("f") || "";
  const open = { status: { in: ["aberto", "pendente"] } };
  const filter =
    f === "urgentes" ? { ...open, lastAction: "Solicitação de Urgência" } : f === "encerrar" ? CAN_CLOSE_WHERE : f === "atrasados" ? open : {};
  let tickets = await prisma.workTicket.findMany({
    where: { ...filter, ...(q ? { OR: [{ ticketId: { contains: q } }, { errorType: { contains: q, mode: "insensitive" as const } }] } : {}) },
    orderBy: { updatedAt: "desc" },
    take: f ? 500 : 100,
  });
  if (f === "atrasados") tickets = tickets.filter((t) => alertsFor(t).overdue);
  const config = await prisma.agentConfig.findFirst({ select: { workGuideUrl: true, workTicketUrl: true, workRedmineUrl: true } });
  return NextResponse.json({
    tickets,
    stats: await workStats(),
    guideUrl: config?.workGuideUrl || "",
    links: { ticket: config?.workTicketUrl || "", redmine: config?.workRedmineUrl || "" },
  });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await upsertWorkTicket(await request.json(), "painel"));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Informe o chamado" }, { status: 400 });
  await prisma.workTicket.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
