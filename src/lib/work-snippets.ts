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

/** Atalho válido: "/" ou "\" + letras, números, - ou _ (ex: /padrao, \w, /retorno-2). */
export const SHORTCUT_RE = /^[/\\][a-z0-9_-]{1,30}$/;

/** "/Olá Mundo" → "/ola-mundo": sem acento, minúsculo, espaço vira "-", "/" na frente (quem começa com "\" fica com "\"). */
export function normalizeShortcut(raw: string): string {
  return String(raw || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^([^/\\])/, "/$1");
}

export type Rejected = { shortcut: string; title: string; body: string; motivo: string };

/**
 * Grava a lista. Atalho com problema não some calado: volta em "rejected" com
 * o motivo (o painel mantém na tela para ele corrigir). Antes um atalho
 * inválido sumia e a tela dizia "Salvo".
 */
export async function saveSnippets(list: Partial<Snippet>[]): Promise<{ snippets: Snippet[]; rejected: Rejected[] }> {
  const seen = new Set<string>();
  const clean: Snippet[] = [];
  const rejected: Rejected[] = [];
  for (const s of list) {
    const item = { shortcut: normalizeShortcut(s.shortcut || ""), title: String(s.title || "").trim().slice(0, 80), body: String(s.body || "").slice(0, 5000) };
    const motivo = !SHORTCUT_RE.test(item.shortcut)
      ? `o atalho "${s.shortcut}" tem que começar com / ou \\ e ter só letras, números, - ou _ (até 30)`
      : !item.body.trim() ? "o texto está vazio"
      : seen.has(item.shortcut) ? `"${item.shortcut}" está repetido`
      : "";
    if (motivo) rejected.push({ ...item, shortcut: String(s.shortcut || ""), motivo });
    else { seen.add(item.shortcut); clean.push(item); }
  }
  const lista = clean.slice(0, 200);
  await prisma.$transaction([
    prisma.workSnippet.deleteMany({ where: { shortcut: { notIn: lista.map((s) => s.shortcut) } } }),
    ...lista.map((s, i) => prisma.workSnippet.upsert({ where: { shortcut: s.shortcut }, create: { ...s, sortOrder: i }, update: { ...s, sortOrder: i } })),
  ]);
  return { snippets: await getSnippets(), rejected };
}
