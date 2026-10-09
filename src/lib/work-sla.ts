// Regras de prazo e alertas dos chamados — as mesmas da tela "Meus chamados"
// do escala (o dono montou lá): prazo pela fila/categoria, "URGENTE" pela
// última ação e "Redmine resolvido — encerre". Sem banco: usado no painel
// (navegador), no WhatsApp e no servidor.
//
// Dois badges por chamado (decisão do dono, 09/10/2026):
//  1) PRAZO — conta de quando o chamado chegou para ele ("recebido em"; sem
//     isso, da abertura) e PARA enquanto a situação pausa o relógio (🕒).
//  2) SITUAÇÃO — escolhida por ele (lista editável no painel): com quem está
//     a bola, há quanto tempo, e se pulsa (hora de cobrar/encerrar).

const SLA_RULES: { match: string; days: number }[] = [
  { match: "cadastro", days: 2 },
  { match: "migracao", days: 15 },
  { match: "orientacao", days: 5 },
  { match: "erro", days: 5 },
  { match: "falha", days: 5 },
];

const plain = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "");

/** Situação configurável. pulse: "nunca" | "sempre" | "apos:N" (N dias na situação) | "redmine" (Redmine resolvido). */
export interface Situation {
  key: string;
  emoji: string;
  name: string;
  color: string;
  pauses: boolean;
  pulse: string;
}

/** Lista inicial (o dono edita no painel). */
export const DEFAULT_SITUATIONS: Situation[] = [
  { key: "em-analise", emoji: "🔍", name: "Em análise", color: "#64748b", pauses: false, pulse: "nunca" },
  { key: "aguardando-usuario", emoji: "⏳", name: "Aguardando usuário", color: "#2563eb", pauses: true, pulse: "apos:2" },
  { key: "aguardando-redmine", emoji: "🔁", name: "Aguardando Redmine", color: "#7c3aed", pauses: true, pulse: "redmine" },
  { key: "aguardando-gestor", emoji: "👥", name: "Aguardando gestor/outra equipe", color: "#475569", pauses: true, pulse: "apos:3" },
  { key: "retornar-usuario", emoji: "📞", name: "Retornar ao usuário", color: "#ea580c", pauses: false, pulse: "sempre" },
];

export interface SlaTicket {
  status: string;
  openedAt: string | Date | null;
  receivedAt?: string | Date | null;
  slaOverride?: number | null;
  queue?: string | null;
  errorType?: string | null;
  lastAction?: string | null;
  redmineStatus?: string | null;
  situation?: string | null;
  situationSince?: string | Date | null;
  pausedMs?: number | null;
}

/** Prazo em dias pela fila (ou tipo do erro); null = sem regra. */
export function slaDays(t: Pick<SlaTicket, "queue" | "errorType">): number | null {
  const text = plain(`${t.queue || ""} ${t.errorType || ""}`);
  for (const r of SLA_RULES) if (text.includes(r.match)) return r.days;
  return null;
}

export const isOpenStatus = (status: string) => status === "aberto" || status === "pendente";

const DAY = 86400_000;
const ms = (d: string | Date | null | undefined) => (d ? new Date(d).getTime() : NaN);

/** Dias em aberto (só aberto/pendente), sem o tempo com o relógio parado. */
export function daysOpen(t: SlaTicket, situations: Situation[] = DEFAULT_SITUATIONS): number | null {
  const start = ms(t.receivedAt) || ms(t.openedAt);
  if (!start || !isOpenStatus(t.status)) return null;
  const sit = situations.find((s) => s.key === t.situation);
  const pausedNow = sit?.pauses && t.situationSince ? Math.max(0, Date.now() - ms(t.situationSince)) : 0;
  return Math.max(0, Math.floor((Date.now() - start - (t.pausedMs || 0) - pausedNow) / DAY));
}

/** Prazo usado na cor do badge quando a fila não tem regra (erro/falha = 5). */
export const DEFAULT_SLA = 5;

/** 🟢 dentro do prazo · 🟡 faltam 2 dias ou menos · 🔴 passou do prazo. */
export function ageColor(days: number | null, sla: number | null): "verde" | "amarelo" | "vermelho" | null {
  if (days === null) return null;
  const limit = sla ?? DEFAULT_SLA;
  return days >= limit ? "vermelho" : days >= limit - 2 ? "amarelo" : "verde";
}

/** Badge da situação: emoji, nome, cor, dias nela e se está pulsando agora. */
export function situationBadge(t: SlaTicket, situations: Situation[] = DEFAULT_SITUATIONS) {
  const sit = situations.find((s) => s.key === t.situation);
  if (!sit || !isOpenStatus(t.status)) return null;
  const days = t.situationSince ? Math.max(0, Math.floor((Date.now() - ms(t.situationSince)) / DAY)) : 0;
  const after = sit.pulse.match(/^apos:(\d+)$/);
  const pulsing =
    sit.pulse === "sempre" || (after ? days >= Number(after[1]) : false) || (sit.pulse === "redmine" && /^resolvid/i.test(t.redmineStatus || ""));
  return { ...sit, days, pulsing };
}

export function alertsFor(t: SlaTicket, situations: Situation[] = DEFAULT_SITUATIONS) {
  const days = daysOpen(t, situations);
  const sla = t.slaOverride ?? slaDays(t);
  const sit = situationBadge(t, situations);
  const paused = !!sit?.pauses;
  return {
    days,
    sla,
    color: ageColor(days, sla),
    /** Relógio parado (🕒): a bola não está com ele. */
    paused,
    overdue: !paused && days !== null && sla !== null && days >= sla,
    urgent: isOpenStatus(t.status) && (t.lastAction || "") === "Solicitação de Urgência",
    canClose: isOpenStatus(t.status) && /^resolvid/i.test(t.redmineStatus || ""),
    situation: sit,
  };
}
