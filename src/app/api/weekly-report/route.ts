import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart");

  if (weekStart) {
    const report = await prisma.weeklyReport.findFirst({ where: { weekStart } });
    return NextResponse.json(report);
  }

  const reports = await prisma.weeklyReport.findMany({
    orderBy: { weekStart: "desc" },
    take: 10,
  });
  return NextResponse.json(reports);
});

export const POST = withErrorHandling(async (request: Request) => {
  // Chamado pelo scheduler.mjs ou webhook externo
  const config = await prisma.agentConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Configuração ausente" }, { status: 500 });

  const { generateWeeklyReport } = await import("@/lib/weekly-report");

  const providerOpts = {
    aiProvider: config.aiProvider,
    openaiApiKey: config.openaiApiKey,
    openaiModel: config.openaiModel,
    groqApiKey: config.groqApiKey,
    groqModel: config.groqModel,
    openrouterApiKey: config.openrouterApiKey,
    openrouterModel: config.openrouterModel,
  };
  const evolutionConfig = {
    evolutionUrl: config.evolutionUrl,
    evolutionApiKey: config.evolutionApiKey,
    instanceId: config.instanceId,
  };

  await generateWeeklyReport(
    config.ownerName,
    config.ownerRole,
    config.ownerPhone,
    providerOpts,
    evolutionConfig
  );

  return NextResponse.json({ ok: true });
});

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  await prisma.weeklyReport.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
