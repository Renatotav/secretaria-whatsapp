// Regras de prazo e alertas dos chamados — as mesmas da tela "Meus chamados"
// do escala (o dono montou lá): prazo pela fila/categoria, "URGENTE" pela
// última ação e "Redmine resolvido — encerre". Sem banco: usado no painel
// (navegador) e no WhatsApp.

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

export interface SlaTicket {
  status: string;
  openedAt: string | Date | null;
  queue?: string | null;
  errorType?: string | null;
  lastAction?: string | null;
  redmineStatus?: string | null;
}

/** Prazo em dias pela fila (ou tipo do erro); null = sem regra. */
export function slaDays(t: Pick<SlaTicket, "queue" | "errorType">): number | null {
  const text = plain(`${t.queue || ""} ${t.errorType || ""}`);
  for (const r of SLA_RULES) if (text.includes(r.match)) return r.days;
  return null;
}

export const isOpenStatus = (status: string) => status === "aberto" || status === "pendente";

/** Dias em aberto (só aberto/pendente). */
export function daysOpen(t: Pick<SlaTicket, "status" | "openedAt">): number | null {
  if (!t.openedAt || !isOpenStatus(t.status)) return null;
  return Math.floor((Date.now() - new Date(t.openedAt).getTime()) / 86400_000);
}

/** Prazo usado na cor do badge quando a fila não tem regra (erro/falha = 5). */
export const DEFAULT_SLA = 5;

/** 🟢 dentro do prazo · 🟡 faltam 2 dias ou menos · 🔴 passou do prazo. */
export function ageColor(days: number | null, sla: number | null): "verde" | "amarelo" | "vermelho" | null {
  if (days === null) return null;
  const limit = sla ?? DEFAULT_SLA;
  return days >= limit ? "vermelho" : days >= limit - 2 ? "amarelo" : "verde";
}

export function alertsFor(t: SlaTicket) {
  const days = daysOpen(t);
  const sla = slaDays(t);
  return {
    days,
    sla,
    color: ageColor(days, sla),
    overdue: days !== null && sla !== null && days >= sla,
    urgent: isOpenStatus(t.status) && (t.lastAction || "") === "Solicitação de Urgência",
    canClose: isOpenStatus(t.status) && /^resolvid/i.test(t.redmineStatus || ""),
  };
}
