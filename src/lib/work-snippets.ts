import { prisma } from "./prisma";

// Atalhos de texto (estilo Text Blaze, do dono): "/padrao" vira a mensagem.
// Editados no painel; a extensão baixa a lista e expande em qualquer campo.

export interface Snippet {
  shortcut: string;
  title: string;
  body: string;
}

export async function getSnippets(): Promise<Snippet[]> {
  const rows = await prisma.workSnippet.findMany({ orderBy: [{ sortOrder: "asc" }, { shortcut: "asc" }] });
  return rows.map(({ shortcut, title, body }) => ({ shortcut, title, body }));
}

/** Atalho válido: "/" + letras, números, - ou _ (ex: /padrao, /retorno-2). */
export const SHORTCUT_RE = /^\/[a-z0-9_-]{1,30}$/;

export async function saveSnippets(list: Partial<Snippet>[]): Promise<Snippet[]> {
  const seen = new Set<string>();
  const clean = list
    .map((s) => ({
      shortcut: String(s.shortcut || "").trim().toLowerCase().replace(/^([^/])/, "/$1"),
      title: String(s.title || "").trim().slice(0, 80),
      body: String(s.body || "").slice(0, 5000),
    }))
    .filter((s) => SHORTCUT_RE.test(s.shortcut) && s.body.trim() && !seen.has(s.shortcut) && seen.add(s.shortcut))
    .slice(0, 200);
  await prisma.$transaction([
    prisma.workSnippet.deleteMany({ where: { shortcut: { notIn: clean.map((s) => s.shortcut) } } }),
    ...clean.map((s, i) => prisma.workSnippet.upsert({ where: { shortcut: s.shortcut }, create: { ...s, sortOrder: i }, update: { ...s, sortOrder: i } })),
  ]);
  return getSnippets();
}
