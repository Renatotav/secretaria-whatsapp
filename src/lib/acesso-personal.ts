// Acesso do personal (o irmão, 27/11/2026): senha própria que abre só Treino e Corpo no painel.
// O dono cria/troca/tira pelo WhatsApp; no banco fica só o hash da senha e a "geração"
// (trocar ou tirar muda a geração e derruba os logins antigos dele).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

const KEY = "acesso:personal";
type Acesso = { hash: string; gen: string; criadoEm: string };

const hash = (senha: string) => createHash("sha256").update(`personal:${senha}`).digest("hex");

export async function acessoPersonal(): Promise<Acesso | null> {
  const r = await prisma.flowState.findUnique({ where: { key: KEY } });
  return (r?.value as Acesso | undefined) ?? null;
}

/** Senha do personal confere? Devolve a geração para o login. */
export async function senhaDoPersonal(senha: string): Promise<string | null> {
  const a = await acessoPersonal();
  if (!a || !senha) return null;
  const x = Buffer.from(hash(senha)), y = Buffer.from(a.hash);
  return x.length === y.length && timingSafeEqual(x, y) ? a.gen : null;
}

// Sem letras que confundem (0/O, 1/l/I): ele vai digitar no iPhone.
const LETRAS = "abcdefghjkmnpqrstuvwxyz23456789";
function novaSenha(): string {
  const b = randomBytes(10);
  const s = Array.from(b, (x) => LETRAS[x % LETRAS.length]).join("");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

/** "senha do personal" (cria ou troca) e "tira o acesso do personal". */
export async function applyAcessoPersonalCommand(text: string): Promise<string | null> {
  const t = text.trim().toLowerCase();
  if (/^(?:tira(?:r)?|remove(?:r)?|corta(?:r)?|bloqueia(?:r)?)\s+(?:o\s+)?acesso\s+do\s+personal\.?$/.test(t)) {
    await prisma.flowState.deleteMany({ where: { key: KEY } });
    return "🔒 Acesso do personal tirado. Ele sai do painel na próxima vez que abrir.";
  }
  if (!/^(?:(?:nova|cria(?:r)?|troca(?:r)?)\s+(?:a\s+)?)?(?:senha|acesso)\s+do\s+personal\.?$/.test(t)) return null;
  const senha = novaSenha();
  const value = { hash: hash(senha), gen: randomBytes(8).toString("hex"), criadoEm: new Date().toISOString() };
  await prisma.flowState.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return (
    `🏋️ Senha do personal: *${senha}*\n` +
    "Ela abre só *Treino* e *Corpo* (peso, comida, gastos com comida). Financeiro, trabalho e diário ficam fechados.\n" +
    "Para ele: abrir o endereço do painel no Safari, entrar com essa senha e tocar em Compartilhar › *Adicionar à Tela de Início*.\n" +
    "Trocar: *senha do personal* de novo. Tirar: *tira o acesso do personal*."
  );
}
