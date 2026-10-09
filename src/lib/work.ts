import { prisma } from "./prisma";
import { maskPersonalData, normalizeTicketId } from "./work-privacy";
import { alertsFor } from "./work-sla";

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
  const saved = await prisma.workTicket.upsert({
    where: { ticketId },
    create: { ticketId, source, ...data },
    // Texto novo = grupo do erro recalculado pelo agendador.
    update: { ...data, ...(data.description !== undefined || data.errorType !== undefined ? { errorGroup: "" } : {}) },
  });
  return saved;
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

/** Urgentes (última ação "Solicitação de Urgência") e atrasados (passou do prazo da fila). */
async function openAlerts() {
  const open = await prisma.workTicket.findMany({
    where: { status: { in: ["aberto", "pendente"] } },
    select: { status: true, openedAt: true, queue: true, errorType: true, lastAction: true, redmineStatus: true },
  });
  const a = open.map(alertsFor);
  return { urgentes: a.filter((x) => x.urgent).length, atrasados: a.filter((x) => x.overdue).length };
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
    select: { errorType: true, origin: true, errorGroup: true },
  });
  const tally = (key: "errorType" | "origin" | "errorGroup") =>
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
    gruposDoMes: tally("errorGroup").filter((g) => g.name !== "(sem)" && g.name !== "Sem grupo"),
    ...(await openAlerts()),
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
    select: { status: true, resolvedAt: true, errorType: true, errorGroup: true },
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
    (() => {
      const g = Object.entries(
        closed.reduce<Record<string, number>>((acc, t) => (t.errorGroup && t.errorGroup !== "Sem grupo" ? ((acc[t.errorGroup] = (acc[t.errorGroup] || 0) + 1), acc) : acc), {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      return g.length ? `🗂️ Grupos: ${g.map(([n, c]) => `${n} (${c})`).join(" · ")}` : "";
    })(),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Situação atual dos alertas (mesmas regras do escala). */
export async function workAlertsNow() {
  const open = await prisma.workTicket.findMany({
    where: { status: { in: ["aberto", "pendente"] } },
    select: { ticketId: true, status: true, openedAt: true, queue: true, errorType: true, lastAction: true, redmineStatus: true, redmine: true },
    orderBy: { openedAt: "asc" },
  });
  const rows = open.map((t) => ({ t, a: alertsFor(t) }));
  return {
    total: open.length,
    urgentes: rows.filter((r) => r.a.urgent).map((r) => r.t.ticketId),
    atrasados: rows.filter((r) => r.a.overdue).map((r) => ({ id: r.t.ticketId, dias: r.a.days ?? 0 })),
    encerrar: rows.filter((r) => r.a.canClose).map((r) => ({ id: r.t.ticketId, redmine: r.t.redmine })),
  };
}

const list = (ids: string[], max = 8) => ids.slice(0, max).join(", ") + (ids.length > max ? ` e mais ${ids.length - max}` : "");

/** Briefing das 8h (dias úteis): vazio quando não há nada pedindo ação. */
const alertKeys = (a: Awaited<ReturnType<typeof workAlertsNow>>) => [
  ...a.urgentes.map((id) => `U:${id}`),
  ...a.atrasados.map((x) => `A:${x.id}`),
  ...a.encerrar.map((x) => `E:${x.id}`),
];

export async function buildWorkBriefing(markAsSent = false): Promise<string> {
  const a = await workAlertsNow();
  // O briefing das 8h conta como aviso: às 11h10 só vem o que mudou depois dele.
  if (markAsSent) await prisma.agentConfig.updateMany({ data: { workAlerted: JSON.stringify(alertKeys(a)) } });
  if (!a.urgentes.length && !a.atrasados.length && !a.encerrar.length) return "";
  return [
    "💼 *Bom dia! Seu trabalho hoje:*",
    a.urgentes.length ? `🚨 ${a.urgentes.length} urgente(s): ${list(a.urgentes)}` : "",
    a.atrasados.length ? `⚠ ${a.atrasados.length} passou(aram) do prazo: ${list(a.atrasados.map((x) => `${x.id} (${x.dias}d)`))}` : "",
    a.encerrar.length ? `⚡ ${a.encerrar.length} com Redmine resolvido para encerrar: ${list(a.encerrar.map((x) => x.id))}` : "",
    `📂 ${a.total} em aberto no total.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Depois da atualização do escala: avisa só o que é novo desde o último aviso. */
export async function buildWorkNewAlerts(): Promise<string> {
  const a = await workAlertsNow();
  const now = alertKeys(a);
  const config = await prisma.agentConfig.findFirst({ select: { id: true, workAlerted: true } });
  if (!config) return "";
  let before: string[] = [];
  try {
    before = JSON.parse(config.workAlerted || "[]");
  } catch {}
  const fresh = now.filter((k) => !before.includes(k));
  // Guarda a situação atual: o que saiu da lista pode voltar a ser avisado.
  await prisma.agentConfig.update({ where: { id: config.id }, data: { workAlerted: JSON.stringify(now) } });
  if (!fresh.length) return "";
  const pick = (p: string) => fresh.filter((k) => k.startsWith(p)).map((k) => k.slice(2));
  const u = pick("U:"), at = pick("A:"), e = pick("E:");
  return [
    "💼 *Novidade nos seus chamados* (atualização do escala):",
    u.length ? `🚨 Urgente: ${list(u)}` : "",
    at.length ? `⚠ Passou do prazo: ${list(at.map((id) => `${id} (${a.atrasados.find((x) => x.id === id)?.dias ?? "?"}d)`))}` : "",
    e.length ? `⚡ Redmine resolvido — encerre: ${list(e)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Painel: resolvidos/Redmine por dia nos últimos 30 dias e tempo médio de resolução. */
export async function workProductivity() {
  const since = new Date(Date.now() - 30 * 86400_000);
  const closed = await prisma.workTicket.findMany({
    where: { status: { in: ["resolvido", "escalado"] }, resolvedAt: { gte: since } },
    select: { status: true, openedAt: true, resolvedAt: true },
  });
  const key = (d: Date) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10); // dia em Brasília
  const days: { dia: string; resolvidos: number; redmine: number }[] = [];
  for (let i = 29; i >= 0; i--) days.push({ dia: key(new Date(Date.now() - i * 86400_000)), resolvidos: 0, redmine: 0 });
  for (const t of closed) {
    const d = days.find((x) => x.dia === key(t.resolvedAt!));
    if (d) t.status === "resolvido" ? d.resolvidos++ : d.redmine++;
  }
  const spans = closed.filter((t) => t.openedAt && t.resolvedAt! > t.openedAt).map((t) => (t.resolvedAt!.getTime() - t.openedAt!.getTime()) / 3600_000);
  const tmrHoras = spans.length ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10 : null;
  return { dias: days, total: closed.length, tmrHoras };
}
