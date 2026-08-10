import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { setInstanceWebhook } from "@/lib/evolution";
import { withErrorHandling } from "@/lib/api-handler";

export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ instance: string }> }) => {
    if (!isAuthenticated(request)) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { instance } = await context.params;

    const config = await prisma.agentConfig.findFirst();
    if (!config || !config.evolutionUrl || !config.evolutionApiKey) {
      return NextResponse.json({ error: "Configure a Evolution API primeiro" }, { status: 400 });
    }

    // Atrás do proxy do Easypanel, request.url pode refletir o host interno
    // (ex: 0.0.0.0:80) em vez do domínio público — por isso prioriza os
    // headers X-Forwarded-* que o proxy define com o host original.
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(request.url).origin;
    const webhookUrl = `${origin}/api/webhook`;
    await setInstanceWebhook(config.evolutionUrl, config.evolutionApiKey, instance, webhookUrl);
    return NextResponse.json({ ok: true, webhookUrl });
  }
);
