import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { upsertWorkTicket, workStats } from "@/lib/work";

// Painel "Trabalho" (protegido pelo login do painel).
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim().toUpperCase();
  const tickets = await prisma.workTicket.findMany({
    where: q ? { OR: [{ ticketId: { contains: q } }, { errorType: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const config = await prisma.agentConfig.findFirst({ select: { workGuideUrl: true } });
  return NextResponse.json({ tickets, stats: await workStats(), guideUrl: config?.workGuideUrl || "" });
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
