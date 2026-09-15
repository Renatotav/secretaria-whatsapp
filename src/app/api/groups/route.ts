import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
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
});

export const PATCH = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const body = await request.json();
  const updated = await prisma.groupConfig.update({ where: { id }, data: body });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.groupConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});

export const POST = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action || "sync";

  if (action === "sync") {
    const config = await prisma.agentConfig.findFirst();
    if (!config || !config.evolutionUrl || !config.evolutionApiKey || !config.instanceId) {
      return NextResponse.json(
        { error: "Configure a URL da Evolution API, API Key e a Instância em Configurações primeiro." },
        { status: 400 }
      );
    }

    const { fetchAllGroups } = await import("@/lib/evolution");
    const evoGroups = await fetchAllGroups(
      config.evolutionUrl,
      config.evolutionApiKey,
      config.instanceId
    );

    let added = 0;
    let updated = 0;

    for (const eg of evoGroups) {
      if (!eg.id || !eg.id.endsWith("@g.us")) continue;

      const existing = await prisma.groupConfig.findUnique({
        where: { groupJid: eg.id },
      });

      if (!existing) {
        await prisma.groupConfig.create({
          data: {
            groupJid: eg.id,
            groupName: eg.subject || eg.id.split("@")[0],
            active: true,
          },
        });
        added++;
      } else if (eg.subject && existing.groupName !== eg.subject) {
        await prisma.groupConfig.update({
          where: { groupJid: eg.id },
          data: { groupName: eg.subject },
        });
        updated++;
      }
    }

    return NextResponse.json({
      ok: true,
      totalEvolution: evoGroups.length,
      added,
      updated,
    });
  }

  return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
});

