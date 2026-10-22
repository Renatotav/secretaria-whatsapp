import { AsyncLocalStorage } from "node:async_hooks";

// O "porquê" de cada mudança no financeiro: quem chama marca o motivo
// (a mensagem dele, o painel, a fatura importada…) e o histórico grava junto.
const store = new AsyncLocalStorage<string>();

/** O await fica dentro: as consultas do Prisma só rodam quando aguardadas. */
export function withReason<T>(reason: string, fn: () => T | PromiseLike<T>): Promise<T> {
  return store.run(reason, async () => await fn());
}

export const currentReason = () => store.getStore() ?? "";
