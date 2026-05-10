import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const groups = await prisma.groupConfig.findMany({
    orderBy: { groupName: "asc" },
  });

  const enriched = await Promise.all(
    groups.map(async (g) => {
      const today = new Date().toISOString().split("T")[0];
      const [messagesCount, urgentCount, ticketsCount] = await Promise.all([
        prisma.groupMessage.count({
          where: {
            groupJid: g.groupJid,
            receivedAt: { gte: new Date(today + "T00:00:00Z") },
          },
        }),
        prisma.agendaItem.count({
          where: { groupJid: g.groupJid, done: false },
        }),
        prisma.ticket.count({
          where: { groupJid: g.groupJid, status: "open" },
        }),
      ]);
      return { ...g, messagesCount, urgentCount, ticketsCount };
    })
  );

  return NextResponse.json(enriched);
}

export async function PATCH(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const body = await request.json();
  const updated = await prisma.groupConfig.update({ where: { id }, data: body });
  return NextResponse.json(updated);
}
