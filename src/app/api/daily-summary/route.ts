import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupJid = searchParams.get("groupJid");
  const date = searchParams.get("date");

  const summaries = await prisma.dailySummary.findMany({
    where: {
      ...(groupJid ? { groupJid } : {}),
      ...(date ? { date } : {}),
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(summaries);
});

export const POST = withErrorHandling(async (request: Request) => {
  // Chamado pelo scheduler.mjs ou webhook externo
  const body = await request.json();
  const groupJid = body.groupJid;
  
  if (!groupJid) return NextResponse.json({ error: "groupJid obrigatório" }, { status: 400 });

  const config = await prisma.agentConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Configuração ausente" }, { status: 500 });

  const { generateDailySummary, generatePersonalDailySummary } = await import("@/lib/summarizer");

  const providerOpts = {
    aiProvider: config.aiProvider,
    openaiApiKey: config.openaiApiKey,
    openaiModel: config.openaiModel,
    groqApiKey: config.groqApiKey,
    groqModel: config.groqModel,
  };
  const evolutionConfig = {
    evolutionUrl: config.evolutionUrl,
    evolutionApiKey: config.evolutionApiKey,
    instanceId: config.instanceId,
  };

  if (groupJid === "personal") {
    await generatePersonalDailySummary(
      config.ownerName,
      config.ownerPhone || "",
      providerOpts,
      evolutionConfig
    );
    return NextResponse.json({ ok: true });
  }

  const group = await prisma.groupConfig.findUnique({ where: { groupJid } });
  if (!group || !group.active) return NextResponse.json({ error: "Grupo inativo ou não encontrado" }, { status: 404 });

  await generateDailySummary(
    group.groupJid,
    group.groupName,
    group.focus,
    config.ownerName,
    config.ownerRole,
    config.ownerPhone || "",
    providerOpts,
    evolutionConfig
  );

  return NextResponse.json({ ok: true });
});
