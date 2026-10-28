// Avisar o dono no WhatsApp (e guardar a resposta para a Alexa falar) e montar
// as opções do provedor de IA a partir do AgentConfig. Saiu de message-handlers.ts
// (28/10/2026).

import { sendTextWithTyping } from "./evolution";
import { type ProviderOptions } from "./openai";
import type { AgentConfig } from "@prisma/client";
import { replyCapture } from "./reply-capture";
import { getEvoConfig } from "./evolution-config";

export function getProviderOpts(config: AgentConfig): ProviderOptions {
  return {
    aiProvider: config.aiProvider,
    openaiApiKey: config.openaiApiKey,
    openaiModel: config.openaiModel,
    groqApiKey: config.groqApiKey,
    groqModel: config.groqModel,
    googleApiKey: config.googleApiKey,
    googleModel: config.googleModel,
    openrouterApiKey: config.openrouterApiKey,
    openrouterModel: config.openrouterModel,
  };
}

export async function notifyOwner(config: AgentConfig, text: string): Promise<void> {
  // Pedido por voz (skill da Alexa): guarda a resposta para ela falar também.
  replyCapture.getStore()?.push(text);
  if (!config.ownerPhone || !config.evolutionUrl) return;
  const evo = getEvoConfig(config);
  await sendTextWithTyping(
    evo.evolutionUrl,
    evo.evolutionApiKey,
    evo.instanceId,
    config.ownerPhone,
    text,
    config.typingMsPerChar,
    config.typingMaxSeconds
  );
}
