import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { CAN_CLOSE_WHERE, upsertWorkTicket, workProductivity, workStats } from "@/lib/work";
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
  const { getSituations } = await import("@/lib/work-situations");
  const situations = await getSituations();
  if (f === "atrasados") tickets = tickets.filter((t) => alertsFor(t, situations).overdue);
  // Imagens anexadas (só os dados para listar; o arquivo vem por /api/work/attachment).
  const atts = await prisma.workAttachment.findMany({
    where: { ticketId: { in: tickets.map((t) => t.ticketId) } },
    select: { id: true, ticketId: true, caption: true },
    orderBy: { createdAt: "asc" },
  });
  const config = await prisma.agentConfig.findFirst({ select: { workGuideUrl: true, workTicketUrl: true, workRedmineUrl: true, workPhone: true } });
  return NextResponse.json({
    tickets: tickets.map((t) => ({ ...t, attachments: atts.filter((a) => a.ticketId === t.ticketId) })),
    phoneLinked: !!config?.workPhone,
    situations,
    produtividade: await workProductivity(),
    stats: await workStats(),
    guideUrl: config?.workGuideUrl || "",
    links: { ticket: config?.workTicketUrl || "", redmine: config?.workRedmineUrl || "" },
  });
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json();
    // Situação ("com quem está a bola") e ajustes manuais do prazo.
    if (body?.action === "situation") {
      const { setSituation } = await import("@/lib/work-situations");
      await setSituation(String(body.ticketId || ""), String(body.situation || ""));
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "adjust") {
      const { normalizeTicketId } = await import("@/lib/work-privacy");
      const received = body.receivedAt ? new Date(`${String(body.receivedAt).slice(0, 10)}T12:00:00-03:00`) : null;
      const sla = body.slaOverride === "" || body.slaOverride === null || body.slaOverride === undefined ? null : Math.round(Number(body.slaOverride));
      if (received && isNaN(received.getTime())) throw new Error("Data inválida");
      if (sla !== null && (!Number.isFinite(sla) || sla < 1 || sla > 365)) throw new Error("Prazo deve ser de 1 a 365 dias");
      await prisma.workTicket.update({ where: { ticketId: normalizeTicketId(String(body.ticketId || "")) }, data: { receivedAt: received, slaOverride: sla } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(await upsertWorkTicket(body, "painel"));
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
