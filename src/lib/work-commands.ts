import { prisma } from "./prisma";
import { upsertWorkTicket, workStats } from "./work";
import { normalizeTicketId } from "./work-privacy";

// Comandos do trabalho pelo WhatsApp, por regra fixa (nada disso vai para a
// IA nem fica no histórico da conversa — dado do Tribunal não passa por ela).
// Sempre exigem a palavra "chamado" para não confundir com o financeiro:
//   "chamado 2154585 resolvido: reset de senha"
//   "chamado 2154585 virou redmine 4321"  /  "chamado 2154585 pendente"
//   "chamado 2154585"  /  "como está o chamado 2154585?"
//   "quantos chamados fechei hoje?" (hoje / semana / mês)
//   "chamados em aberto"

const TICKET = "([A-Za-z]?\\d{6,9})";
const ACTION_RE = new RegExp(
  `^\\s*(?:o\\s+)?chamado\\s+(?:n[ºo°]?\\.?\\s*)?${TICKET}\\s*[,:-]?\\s*(?:foi\\s+|está\\s+|esta\\s+|ficou\\s+)?` +
    `(resolvido|fechado|encerrado|finalizado|pendente|aberto|reaberto|escalado|(?:virou|foi\\s+pro|foi\\s+para\\s+o|abri)\\s+(?:o\\s+)?redmine|redmine)` +
    `(?:\\s*(?:n[ºo°]?\\.?\\s*)?(\\d{3,7}))?\\s*(?:[,:.\\-–]\\s*(.+))?$`,
  "is"
);
const RESOLVED_BY_ME_RE = new RegExp(`^\\s*(?:resolvi|fechei|encerrei|finalizei)\\s+(?:o\\s+)?chamado\\s+${TICKET}\\s*(?:[,:.\\-–]\\s*(.+))?$`, "is");
const LOOKUP_RE = new RegExp(`^\\s*(?:(?:como\\s+(?:está|esta|tá|ta)|e\\s+o|status\\s+do|ver)\\s+)?(?:o\\s+)?chamado\\s+${TICKET}\\s*\\??\\s*$`, "i");
const COUNT_RE = /^\s*quantos\s+chamados\b.*?\b(hoje|semana|m[eê]s)\b/i;
const OPEN_RE = /^\s*(?:quais\s+(?:os\s+)?|meus\s+|o\s+que\s+tenho\s+de\s+)?chamados?\s+(?:em\s+aberto|abertos|pendentes)\s*\??\s*$/i;

const STATUS_LABEL: Record<string, string> = { aberto: "aberto", pendente: "pendente", resolvido: "resolvido ✅", escalado: "virou Redmine 🔁" };
const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");

function statusFrom(word: string): string {
  const w = word.toLowerCase();
  if (/redmine|escalado/.test(w)) return "escalado";
  if (/pendente/.test(w)) return "pendente";
  if (/aberto|reaberto/.test(w)) return "aberto";
  return "resolvido";
}

async function describeTicket(rawId: string): Promise<string> {
  const id = normalizeTicketId(rawId);
  const digits = id.replace(/^[A-Z]/, "");
  const t =
    (await prisma.workTicket.findUnique({ where: { ticketId: id } })) ??
    (/^[A-Z]/.test(id)
      ? null
      : (await prisma.workTicket.findMany({ where: { ticketId: { endsWith: digits } } })).find((r) => r.ticketId.replace(/^[A-Z]/, "") === digits) ?? null);
  if (!t) return `💼 O chamado *${id}* ainda não está na Central. Para registrar: "chamado ${id} resolvido".`;
  const lines = [`💼 *Chamado ${t.ticketId}* — ${STATUS_LABEL[t.status] ?? t.status}`];
  if (t.errorType) lines.push(`Tipo: ${t.errorType}`);
  if (t.origin) lines.push(`Origem: usuário ${t.origin}`);
  if (t.openedAt) lines.push(`Aberto em ${fmtDate(t.openedAt)}`);
  if (t.resolvedAt) lines.push(`${t.status === "escalado" ? "Escalado" : "Resolvido"} em ${fmtDate(t.resolvedAt)}`);
  if (t.redmine) lines.push(`Redmine: ${t.redmine}`);
  if (t.resolution) lines.push(`Resolução: ${t.resolution.length > 300 ? t.resolution.slice(0, 300) + "…" : t.resolution}`);
  return lines.join("\n");
}

/** Responde ao comando do trabalho, ou null se a mensagem não é um deles. */
export async function applyWorkCommand(text: string): Promise<string | null> {
  const msg = text.trim();
  if (!/chamado/i.test(msg)) return null;

  let m = msg.match(ACTION_RE);
  const mine = m ? null : msg.match(RESOLVED_BY_ME_RE);
  if (m || mine) {
    const id = normalizeTicketId((m ?? mine)![1]);
    const status = m ? statusFrom(m[2]) : "resolvido";
    const redmine = m?.[3];
    const note = (m ? m[4] : mine![2])?.trim();
    const before = await prisma.workTicket.findUnique({ where: { ticketId: id }, select: { status: true } });
    const saved = await upsertWorkTicket(
      {
        ticketId: id,
        status,
        ...(redmine ? { redmine } : {}),
        ...(note ? { resolution: note } : {}),
      },
      "whatsapp"
    );
    if (saved.status !== status) {
      return `💼 O chamado *${id}* já está como *${STATUS_LABEL[saved.status] ?? saved.status}* — pelo WhatsApp o status só anda para frente. Para voltar, use a aba Trabalho do painel.`;
    }
    const s = await workStats();
    const what = status === "escalado" ? `virou Redmine${saved.redmine ? ` *${saved.redmine}*` : ""} 🔁` : status === "resolvido" ? "resolvido ✅" : status;
    return [
      `💼 Chamado *${id}* ${before ? "" : "registrado e "}${what}.`,
      `Hoje: ${s.hoje.resolvidos} resolvido(s) · ${s.hoje.escalados} Redmine · ${s.emAberto} em aberto.`,
    ].join("\n");
  }

  if ((m = msg.match(LOOKUP_RE))) return describeTicket(m[1]);

  if ((m = msg.match(COUNT_RE))) {
    const s = await workStats();
    const key = m[1].toLowerCase().startsWith("h") ? "hoje" : m[1].toLowerCase().startsWith("s") ? "semana" : "mes";
    const p = s[key];
    const label = key === "hoje" ? "Hoje" : key === "semana" ? "Nesta semana" : "Neste mês";
    return `💼 ${label}: *${p.resolvidos}* resolvido(s), *${p.escalados}* para o Redmine e ${p.registrados} chamado(s) aberto(s). Em aberto agora: ${s.emAberto}.`;
  }

  if (OPEN_RE.test(msg)) {
    const open = await prisma.workTicket.findMany({
      where: { status: { in: ["aberto", "pendente"] } },
      orderBy: [{ openedAt: "asc" }],
      take: 15,
      select: { ticketId: true, status: true, errorType: true, openedAt: true },
    });
    if (!open.length) return "💼 Nenhum chamado em aberto. 🎉";
    const total = await prisma.workTicket.count({ where: { status: { in: ["aberto", "pendente"] } } });
    const lines = open.map(
      (t) => `• *${t.ticketId}*${t.status === "pendente" ? " (pendente)" : ""}${t.errorType ? ` — ${t.errorType}` : ""}${t.openedAt ? ` · desde ${fmtDate(t.openedAt)}` : ""}`
    );
    return [`💼 *${total} chamado(s) em aberto*${total > open.length ? ` (os ${open.length} mais antigos)` : ""}:`, ...lines].join("\n");
  }

  return null;
}
