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

export function alertsFor(t: SlaTicket) {
  const days = daysOpen(t);
  const sla = slaDays(t);
  return {
    days,
    sla,
    overdue: days !== null && sla !== null && days >= sla,
    urgent: isOpenStatus(t.status) && (t.lastAction || "") === "Solicitação de Urgência",
    canClose: isOpenStatus(t.status) && /^resolvid/i.test(t.redmineStatus || ""),
  };
}
