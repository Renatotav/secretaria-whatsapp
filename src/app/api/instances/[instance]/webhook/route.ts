import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { setInstanceWebhook } from "@/lib/evolution";

export async function POST(request: Request, context: { params: Promise<{ instance: string }> }) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { instance } = await context.params;

  const config = await prisma.agentConfig.findFirst();
  if (!config || !config.evolutionUrl || !config.evolutionApiKey) {
    return NextResponse.json({ error: "Configure a Evolution API primeiro" }, { status: 400 });
  }

  const webhookUrl = `${new URL(request.url).origin}/api/webhook`;

  try {
    await setInstanceWebhook(config.evolutionUrl, config.evolutionApiKey, instance, webhookUrl);
    return NextResponse.json({ ok: true, webhookUrl });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao configurar webhook" },
      { status: 502 }
    );
  }
}
