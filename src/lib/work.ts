import { prisma } from "./prisma";
import { maskPersonalData, normalizeTicketId } from "./work-privacy";

// Central do Atendente PJe: chamados do trabalho do Renato. Tudo que entra
// passa por maskPersonalData (CPF mascarado, sem telefone/e-mail) e nada
// daqui é mandado para a IA.

export const WORK_STATUSES = ["aberto", "pendente", "resolvido", "escalado"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export interface WorkTicketInput {
  ticketId: string;
  openedAt?: string | null;
  status?: string;
  errorType?: string;
  origin?: string;
  resolution?: string;
  redmine?: string;
  description?: string;
}

const clean = (v: unknown, max = 2000) => (typeof v === "string" ? maskPersonalData(v.trim()).slice(0, max) : undefined);

/** Cria ou atualiza o chamado pelo número (chave comum de todo o ecossistema). */
export async function upsertWorkTicket(input: WorkTicketInput, source: "painel" | "extensao" | "whatsapp" | "escala") {
  const ticketId = normalizeTicketId(input.ticketId);
  if (!/^[A-Z]?\d{6,9}$/.test(ticketId)) throw new Error("Número de chamado inválido");
  const status = WORK_STATUSES.includes(input.status as WorkStatus) ? (input.status as WorkStatus) : undefined;
  const origin = input.origin && ["externo", "interno"].includes(input.origin.toLowerCase()) ? input.origin.toLowerCase() : undefined;
  const before = await prisma.workTicket.findUnique({ where: { ticketId } });
  const closing = status && (status === "resolvido" || status === "escalado") && before?.status !== status;
  const data = {
    ...(input.openedAt ? { openedAt: new Date(input.openedAt) } : {}),
    ...(status ? { status } : {}),
    ...(clean(input.errorType, 200) !== undefined ? { errorType: clean(input.errorType, 200) } : {}),
    ...(origin !== undefined ? { origin } : {}),
    ...(clean(input.resolution) !== undefined ? { resolution: clean(input.resolution) } : {}),
    ...(clean(input.redmine, 50) !== undefined ? { redmine: clean(input.redmine, 50) } : {}),
    ...(clean(input.description, 8000) !== undefined ? { description: clean(input.description, 8000) } : {}),
    ...(closing ? { resolvedAt: new Date() } : {}),
  };
  return prisma.workTicket.upsert({
    where: { ticketId },
    create: { ticketId, source, ...data },
    update: data,
  });
}

/** Início do dia/semana/mês no horário de Brasília (em UTC, para comparar com o banco). */
function periodStarts() {
  const brt = new Date(Date.now() - 3 * 3600_000);
  const day = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3));
  const week = new Date(day.getTime() - ((brt.getUTCDay() + 6) % 7) * 86400_000);
  const month = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), 1, 3));
  return { day, week, month };
}

export async function workStats() {
  const starts = periodStarts();
  // "Registrados" pela data de ABERTURA do chamado (importado do escala ou da
  // extensão); sem data de abertura, pela data em que entrou aqui.
  const count = async (since: Date) => ({
    registrados: await prisma.workTicket.count({ where: { OR: [{ openedAt: { gte: since } }, { openedAt: null, createdAt: { gte: since } }] } }),
    resolvidos: await prisma.workTicket.count({ where: { status: "resolvido", resolvedAt: { gte: since } } }),
    escalados: await prisma.workTicket.count({ where: { status: "escalado", resolvedAt: { gte: since } } }),
  });
  const monthTickets = await prisma.workTicket.findMany({
    where: { OR: [{ openedAt: { gte: starts.month } }, { openedAt: null, createdAt: { gte: starts.month } }, { resolvedAt: { gte: starts.month } }] },
    select: { errorType: true, origin: true },
  });
  const tally = (key: "errorType" | "origin") =>
    Object.entries(monthTickets.reduce<Record<string, number>>((acc, t) => ((acc[t[key] || "(sem)"] = (acc[t[key] || "(sem)"] || 0) + 1), acc), {}))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, n]) => ({ name, n }));
  return {
    hoje: await count(starts.day),
    semana: await count(starts.week),
    mes: await count(starts.month),
    emAberto: await prisma.workTicket.count({ where: { status: { in: ["aberto", "pendente"] } } }),
    tiposDoMes: tally("errorType"),
    origemDoMes: tally("origin"),
  };
}

/** Linha do resumo das 21h (vazia se não houve chamado hoje). */
export async function workDigestLine(): Promise<string> {
  const s = await workStats();
  if (s.hoje.registrados + s.hoje.resolvidos + s.hoje.escalados === 0) return "";
  return `💼 Trabalho: ${s.hoje.registrados} chamado(s) hoje · ${s.hoje.resolvidos} resolvido(s) · ${s.hoje.escalados} Redmine · ${s.emAberto} em aberto`;
}
