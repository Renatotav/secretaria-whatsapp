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
  return NextResponse.json({ tickets, stats: await workStats() });
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
  const { id } = await request.json();
  await prisma.workTicket.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
