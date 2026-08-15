import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const done = searchParams.get("done");
  const source = searchParams.get("source");
  const category = searchParams.get("category");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const items = await prisma.agendaItem.findMany({
    where: {
      ...(done !== null ? { done: done === "true" } : {}),
      ...(source ? { source } : {}),
      ...(category ? { category } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(items);
});

export const PATCH = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const body = await request.json();
  const updated = await prisma.agendaItem.update({ where: { id }, data: body });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.agendaItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});

export const POST = withErrorHandling(async (request: Request) => {
  // Chamado pelo scheduler.mjs ou webhook externo para forçar execução de rotinas (ex: reminders)
  const body = await request.json();
  
  if (body.action === "reminders") {
    const config = await prisma.agentConfig.findFirst();
    if (!config) return NextResponse.json({ error: "Configuração ausente" }, { status: 500 });
    
    const { checkPendingReminders } = await import("@/lib/reminder");
    const evolutionConfig = {
      evolutionUrl: config.evolutionUrl,
      evolutionApiKey: config.evolutionApiKey,
      instanceId: config.instanceId,
    };
    
    await checkPendingReminders(config.ownerPhone, config.reminderHours, evolutionConfig);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ação não suportada" }, { status: 400 });
});
