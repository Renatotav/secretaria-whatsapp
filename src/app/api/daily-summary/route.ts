import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { autoMarkPaid } from "@/lib/auto-pay";

export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
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
  // Executa o auto-pagamento sempre que um resumo for gerado, garantindo dados atualizados
  await autoMarkPaid();

  // Chamado pelo scheduler.mjs ou webhook externo
  const body = await request.json();
  const groupJid = body.groupJid;
  
  if (!groupJid) return NextResponse.json({ error: "groupJid obrigatório" }, { status: 400 });

  const config = await prisma.agentConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Configuração ausente" }, { status: 500 });

  const { generateDailySummary } = await import("@/lib/summarizer");

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

  // Resumo do dia dele ("Seu dia"): o mesmo das 21h, gerado na hora. Troca
  // o de hoje, se já existir, e manda no WhatsApp.
  if (groupJid === "self" || groupJid === "personal") {
    const { buildDailyDigest, notifyOwner, sendBudgetChart } = await import("@/lib/message-handlers");
    const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const date = brt.toISOString().slice(0, 10);
    const text = await buildDailyDigest();
    await prisma.dailySummary.deleteMany({ where: { groupJid: "self", date } });
    await prisma.dailySummary.create({ data: { groupJid: "self", groupName: "Seu dia", date, summary: text, sentAt: new Date() } });
    await notifyOwner(config, text);
    await sendBudgetChart(config);
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

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all");
  if (all === "true") {
    await prisma.dailySummary.deleteMany({});
    return NextResponse.json({ ok: true });
  }
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  await prisma.dailySummary.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
