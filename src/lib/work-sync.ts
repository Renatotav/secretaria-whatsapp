import { prisma } from "./prisma";

// "Atualizar do escala agora": o app não roda o script (fica fora do
// container). Ele só grava o pedido; o vigia do servidor (cron a cada minuto)
// vê o pedido, roda a cópia (só leitura no escala) e marca workSyncedAt.

export async function requestEscalaSync() {
  await prisma.agentConfig.updateMany({ data: { workSyncRequested: new Date() } });
  return escalaSyncStatus();
}

export async function escalaSyncStatus() {
  const c = await prisma.agentConfig.findFirst({ select: { workSyncRequested: true, workSyncedAt: true } });
  const pending = !!c?.workSyncRequested && (!c.workSyncedAt || c.workSyncRequested > c.workSyncedAt);
  return { pending, requestedAt: c?.workSyncRequested ?? null, syncedAt: c?.workSyncedAt ?? null };
}
