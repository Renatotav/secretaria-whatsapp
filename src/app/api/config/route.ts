import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

// Chaves e senhas nunca vão inteiras para o navegador: saem como "••••" + os
// 4 últimos caracteres. Voltando assim no PUT, ficam como estão; apagar o
// campo apaga a chave; digitar uma nova troca.
const SECRETS = ["evolutionApiKey", "openaiApiKey", "groqApiKey", "googleApiKey", "openrouterApiKey", "workApiToken", "webhookToken", "deviceToken", "alexaToken", "mcpToken", "workPairCode"] as const;
const MASK = "••••";

// Só estes campos podem ser mudados pelo painel (o resto é estado interno da
// secretária: fila da Alexa, presença, alertas, sincronização…).
const EDITABLE = new Set<string>([
  "name", "systemPrompt", "temperature", "maxTokens", "historyLimit", "enabled", "allowedPhones",
  "evolutionUrl", "evolutionApiKey", "instanceId", "aiProvider",
  "openaiApiKey", "openaiModel", "groqApiKey", "groqModel", "googleApiKey", "googleModel", "openrouterApiKey", "openrouterModel",
  "ownerPhone", "ownerName", "ownerRole", "summaryTime", "weeklyTime", "reminderHours",
  "audioEnabled", "privateBriefings", "detectCommitments", "mutedContacts", "debounceSeconds", "typingMsPerChar", "typingMaxSeconds",
  "creditCardDueDay", "creditCardBestDay", "cardBillDays", "invoiceBuddyName", "invoiceBuddyPhone",
]);

function masked<T extends Record<string, unknown>>(config: T): T {
  const out: Record<string, unknown> = { ...config };
  for (const k of SECRETS) {
    const v = out[k];
    if (typeof v === "string" && v) out[k] = MASK + v.slice(-4);
  }
  return out as T;
}

export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let config = await prisma.agentConfig.findFirst();
  if (!config) {
    config = await prisma.agentConfig.create({ data: {} });
  }
  return NextResponse.json(masked(config));
});

export const PUT = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue;
    if (typeof v === "string" && v.startsWith(MASK)) continue; // chave não mexida
    data[k] = v;
  }
  let config = await prisma.agentConfig.findFirst();

  if (!config) {
    config = await prisma.agentConfig.create({ data: data as Prisma.AgentConfigCreateInput });
  } else {
    config = await prisma.agentConfig.update({
      where: { id: config.id },
      data: data as Prisma.AgentConfigUpdateInput,
    });
  }

  return NextResponse.json(masked(config));
});
