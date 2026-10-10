import { prisma } from "./prisma";
import { maskPersonalData, normalizeTicketId } from "./work-privacy";

// CRM leve do WhatsApp Web: notas, etiquetas, chamados ligados e lembrete por
// contato. Nada é enviado no WhatsApp: a extensão só mostra e insere texto.

/** "Dra. Mayara Coutinho (MPCE)" → "dra mayara coutinho mpce"; números ficam só com dígitos. */
export function contactKey(raw: string): string {
  const t = String(raw || "").trim();
  if (/^\+?[\d\s().-]{8,}$/.test(t)) return t.replace(/\D/g, "");
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 120);
}

export async function getContact(raw: string) {
  const key = contactKey(raw);
  if (!key) return null;
  const c = await prisma.workContact.findUnique({ where: { key } });
  const tickets = c?.tickets.length
    ? await prisma.workTicket.findMany({ where: { ticketId: { in: c.tickets } } })
    : [];
  const labels = await allLabels();
  return { key, contact: c, tickets, labels };
}

/** Etiquetas já usadas (para sugerir). */
export async function allLabels(): Promise<string[]> {
  const rows = await prisma.workContact.findMany({ select: { labels: true } });
  return [...new Set(rows.flatMap((r) => r.labels))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export interface ContactInput {
  key: string;
  name?: string;
  labels?: string[];
  notes?: string;
  tickets?: string[];
  reminderAt?: string | null;
  reminderText?: string;
}

export async function saveContact(input: ContactInput) {
  const key = contactKey(input.key);
  if (!key) throw new Error("Conversa sem nome");
  const data = {
    ...(input.name !== undefined ? { name: String(input.name).trim().slice(0, 120) } : {}),
    ...(Array.isArray(input.labels) ? { labels: [...new Set(input.labels.map((l) => String(l).trim().slice(0, 30)).filter(Boolean))].slice(0, 12) } : {}),
    ...(input.notes !== undefined ? { notes: maskPersonalData(String(input.notes)).slice(0, 8000) } : {}),
    ...(Array.isArray(input.tickets)
      ? { tickets: [...new Set(input.tickets.map(normalizeTicketId).filter((t) => /^[A-Z]?\d{6,9}$/.test(t)))].slice(0, 50) }
      : {}),
    ...(input.reminderAt !== undefined
      ? { reminderAt: input.reminderAt ? new Date(input.reminderAt) : null, reminderText: String(input.reminderText || "").slice(0, 300) }
      : {}),
  };
  if ("reminderAt" in data && data.reminderAt && isNaN(data.reminderAt.getTime())) throw new Error("Data do lembrete inválida");
  return prisma.workContact.upsert({ where: { key }, create: { key, name: String(input.name || input.key).slice(0, 120), ...data }, update: data });
}

/** Lembretes vencidos: avisa e limpa (chamado pelo agendador). */
export async function dueContactReminders(): Promise<string[]> {
  const due = await prisma.workContact.findMany({ where: { reminderAt: { lte: new Date() } } });
  const msgs: string[] = [];
  for (const c of due) {
    msgs.push(
      `📞 *Lembrete de contato:* ${c.name}${c.reminderText ? `\n${c.reminderText}` : ""}${c.tickets.length ? `\nChamado(s): ${c.tickets.join(", ")}` : ""}`
    );
    await prisma.workContact.update({ where: { id: c.id }, data: { reminderAt: null } });
  }
  return msgs;
}
