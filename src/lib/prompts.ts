// Prompts da IA no banco (tabela Prompt), com versão. O texto usa marcadores
// {{nome}} que o código preenche; sem versão ativa no banco, vale o padrão do código.
import { prisma } from "./prisma";

const cache = new Map<string, { text: string | null; at: number }>();
const TTL_MS = 60_000; // trocar a versão ativa vale em até 1 minuto, sem reiniciar

/** Troca cada {{nome}} pelo valor; marcador sem valor vira vazio. */
export function preenche(texto: string, valores: Record<string, string | number>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(valores[k] ?? ""));
}

/** Texto da versão ativa do prompt, ou o padrão do código (banco fora do ar também cai no padrão). */
export async function promptAtivo(nome: string, padrao: string): Promise<string> {
  const c = cache.get(nome);
  if (c && Date.now() - c.at < TTL_MS) return c.text ?? padrao;
  const row = await prisma.prompt
    .findFirst({ where: { name: nome, active: true }, orderBy: { version: "desc" }, select: { text: true } })
    .catch(() => null);
  cache.set(nome, { text: row?.text ?? null, at: Date.now() });
  return row?.text ?? padrao;
}
