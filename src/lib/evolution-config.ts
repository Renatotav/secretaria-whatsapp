// Endereço, chave e instância da Evolution (WhatsApp) a partir do AgentConfig.
// Saiu de message-handlers.ts (28/10/2026).

import type { AgentConfig } from "@prisma/client";

export function getEvoConfig(config: AgentConfig) {
  return {
    evolutionUrl: config.evolutionUrl,
    evolutionApiKey: config.evolutionApiKey,
    instanceId: config.instanceId,
  };
}
