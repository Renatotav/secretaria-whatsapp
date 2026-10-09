import { prisma } from "./prisma";
import { DEFAULT_SITUATIONS, type Situation } from "./work-sla";
import { normalizeTicketId } from "./work-privacy";

// Situações dos chamados ("com quem está a bola"): lista do dono, editável no
// painel. Trocar de situação acumula o tempo com o relógio parado (pausedMs)
// e grava o histórico.

export async function getSituations(): Promise<Situation[]> {
  let rows = await prisma.workSituation.findMany({ orderBy: { sortOrder: "asc" } });
  if (!rows.length) {
    await prisma.workSituation.createMany({ data: DEFAULT_SITUATIONS.map((s, i) => ({ ...s, sortOrder: i })), skipDuplicates: true });
    rows = await prisma.workSituation.findMany({ orderBy: { sortOrder: "asc" } });
  }
  return rows.map(({ key, emoji, name, color, pauses, pulse }) => ({ key, emoji, name, color, pauses, pulse }));
}

const slug = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Salva a lista inteira vinda do editor do painel. */
export async function saveSituations(list: Partial<Situation>[]): Promise<Situation[]> {
  const clean = list
    .filter((s) => s.name && String(s.name).trim())
    .slice(0, 20)
    .map((s, i) => ({
      key: s.key && /^[a-z0-9-]{1,40}$/.test(s.key) ? s.key : slug(String(s.name)) || `situacao-${i}`,
      emoji: String(s.emoji || "•").slice(0, 8),
      name: String(s.name).trim().slice(0, 60),
      color: /^#[0-9a-f]{6}$/i.test(String(s.color)) ? String(s.color) : "#64748b",
      pauses: !!s.pauses,
      pulse: /^(nunca|sempre|redmine|apos:\d{1,2})$/.test(String(s.pulse)) ? String(s.pulse) : "nunca",
      sortOrder: i,
    }));
  await prisma.$transaction([
    prisma.workSituation.deleteMany({ where: { key: { notIn: clean.map((s) => s.key) } } }),
    ...clean.map((s) => prisma.workSituation.upsert({ where: { key: s.key }, create: s, update: s })),
  ]);
  return getSituations();
}

/** Troca a situação do chamado ("" = nenhuma). Fecha a pausa anterior, se houver. */
export async function setSituation(ticketRaw: string, key: string) {
  const ticketId = normalizeTicketId(ticketRaw);
  const t = await prisma.workTicket.findUnique({ where: { ticketId }, select: { situation: true, situationSince: true, pausedMs: true } });
  if (!t) throw new Error("Chamado não encontrado");
  if (t.situation === key) return;
  const situations = await getSituations();
  if (key && !situations.some((s) => s.key === key)) throw new Error("Situação desconhecida");
  const prev = situations.find((s) => s.key === t.situation);
  const extra = prev?.pauses && t.situationSince ? Math.max(0, Date.now() - t.situationSince.getTime()) : 0;
  await prisma.workTicket.update({
    where: { ticketId },
    data: { situation: key, situationSince: key ? new Date() : null, pausedMs: (t.pausedMs || 0) + extra },
  });
  await prisma.workSituationLog.create({ data: { ticketId, situation: key || "(nenhuma)" } });
}

/** "aguardando usuário", "aguardando-usuario", "retornar" → a situação (para o WhatsApp). */
export async function findSituation(text: string): Promise<Situation | null> {
  const want = slug(text);
  if (!want) return null;
  const list = await getSituations();
  return list.find((s) => s.key === want || slug(s.name) === want) ?? list.find((s) => slug(s.name).startsWith(want) || want.startsWith(slug(s.name))) ?? null;
}
