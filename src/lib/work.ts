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
  /** Quando foi resolvido (importação de histórico). Sem isso, fechar agora = resolvido agora. */
  resolvedAt?: string | null;
}

/** Data válida e não futura (para não inventar "resolvido hoje" ao importar histórico). */
function pastDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) || d.getTime() > Date.now() + 60_000 ? null : d;
}

const clean = (v: unknown, max = 2000) => (typeof v === "string" ? maskPersonalData(v.trim()).slice(0, max) : undefined);

/** Cria ou atualiza o chamado pelo número (chave comum de todo o ecossistema). */
export async function upsertWorkTicket(input: WorkTicketInput, source: "painel" | "extensao" | "whatsapp" | "escala" | "planilha") {
  const ticketId = normalizeTicketId(input.ticketId);
  if (!/^[A-Z]?\d{6,9}$/.test(ticketId)) throw new Error("Número de chamado inválido");
  let status = WORK_STATUSES.includes(input.status as WorkStatus) ? (input.status as WorkStatus) : undefined;
  const origin = input.origin && ["externo", "interno"].includes(input.origin.toLowerCase()) ? input.origin.toLowerCase() : undefined;
  const before = await prisma.workTicket.findUnique({ where: { ticketId } });
  // Status só anda para frente quando vem de importação: Redmine é o fim da
  // linha; resolvido não volta para aberto. No painel, ele pode mudar à mão.
  if (status && before && source !== "painel") {
    const rank: Record<string, number> = { aberto: 0, pendente: 1, resolvido: 2, escalado: 3 };
    if ((rank[status] ?? 0) < (rank[before.status] ?? 0)) status = undefined;
  }
  const closing = status && (status === "resolvido" || status === "escalado") && before?.status !== status;
  const data = {
    ...(input.openedAt ? { openedAt: new Date(input.openedAt) } : {}),
    ...(status ? { status } : {}),
    ...(clean(input.errorType, 200) !== undefined ? { errorType: clean(input.errorType, 200) } : {}),
    ...(origin !== undefined ? { origin } : {}),
    ...(clean(input.resolution) !== undefined ? { resolution: clean(input.resolution) } : {}),
    ...(clean(input.redmine, 50) !== undefined ? { redmine: clean(input.redmine, 50) } : {}),
    ...(clean(input.description, 8000) !== undefined ? { description: clean(input.description, 8000) } : {}),
    ...(closing ? { resolvedAt: pastDate(input.resolvedAt) ?? new Date() } : {}),
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

/** Chamados ainda abertos cujo Redmine já foi resolvido (vem do escala): dá para encerrar no Assyst. */
export const CAN_CLOSE_WHERE = {
  status: { in: ["aberto", "pendente"] },
  redmineStatus: { startsWith: "Resolvid", mode: "insensitive" as const },
};

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
    paraEncerrar: await prisma.workTicket.findMany({
      where: CAN_CLOSE_WHERE,
      orderBy: { openedAt: "asc" },
      select: { ticketId: true, redmine: true, openedAt: true },
    }),
  };
}

/** Linha do resumo das 21h (vazia se não houve chamado hoje). */
export async function workDigestLine(): Promise<string> {
  const s = await workStats();
  const toClose = s.paraEncerrar.length ? ` · ✅ ${s.paraEncerrar.length} com Redmine resolvido para encerrar (${s.paraEncerrar.map((t) => t.ticketId).join(", ")})` : "";
  if (s.hoje.registrados + s.hoje.resolvidos + s.hoje.escalados === 0 && !toClose) return "";
  return `💼 Trabalho: ${s.hoje.registrados} chamado(s) hoje · ${s.hoje.resolvidos} resolvido(s) · ${s.hoje.escalados} Redmine · ${s.emAberto} em aberto${toClose}`;
}

/**
 * Bloco "💼 Trabalho" do relatório de domingo: resolvidos por dia da semana
 * (barrinha), Redmines e tipos de erro mais comuns. Só números — nada daqui
 * vai para a IA. `monday` = segunda da semana (data local, meio-dia).
 */
export async function workWeekSection(monday: Date): Promise<string> {
  const start = new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate(), 3)); // 00:00 BRT
  const end = new Date(start.getTime() + 7 * 86400_000);
  const closed = await prisma.workTicket.findMany({
    where: { status: { in: ["resolvido", "escalado"] }, resolvedAt: { gte: start, lt: end } },
    select: { status: true, resolvedAt: true, errorType: true },
  });
  const opened = await prisma.workTicket.count({
    where: { OR: [{ openedAt: { gte: start, lt: end } }, { openedAt: null, createdAt: { gte: start, lt: end } }] },
  });
  const emAberto = await prisma.workTicket.count({ where: { status: { in: ["aberto", "pendente"] } } });
  if (closed.length === 0 && opened === 0) return "";

  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const perDay = new Array(7).fill(0);
  for (const t of closed) perDay[Math.floor((t.resolvedAt!.getTime() - start.getTime()) / 86400_000)]++;
  const max = Math.max(...perDay, 1);
  const bars = days
    .map((d, i) => ({ d, n: perDay[i] }))
    .filter(({ n }, i) => n > 0 || i < 5) // fim de semana só aparece se teve chamado
    .map(({ d, n }) => `${d} ${"▓".repeat(Math.round((n / max) * 8)) || "·"} ${n}`);

  const resolvidos = closed.filter((t) => t.status === "resolvido").length;
  const escalados = closed.length - resolvidos;
  const types = Object.entries(
    closed.reduce<Record<string, number>>((acc, t) => (t.errorType ? ((acc[t.errorType] = (acc[t.errorType] || 0) + 1), acc) : acc), {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const best = perDay.indexOf(Math.max(...perDay));

  return [
    `\n💼 *Trabalho na semana:* ${resolvidos} resolvido(s) · ${escalados} Redmine · ${opened} aberto(s) · ${emAberto} em aberto agora`,
    "```",
    ...bars,
    "```",
    closed.length ? `🏆 Melhor dia: ${days[best]} (${perDay[best]})` : "",
    types.length ? `🔎 Erros mais comuns: ${types.map(([t, n]) => `${t} (${n})`).join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
