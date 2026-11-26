// Perguntas do diário (27/11/2026, pedido dele: "todo dia perguntar como está seu dia e como terminou").
// 7:50 "como começa" (nota 1 a 5 + uma palavra) e 21:50 "como terminou" com uma pergunta que muda a cada dia.
// A resposta que chega até 3 h depois vira o dia no diário. Sem cobrança: não pergunta de novo se ele não responder.

import { prisma } from "./prisma";

const KEY = "diario:checkin";
const JANELA_MS = 3 * 3600_000;
type Pendente = { tipo: "manha" | "noite"; pergunta: string; at: number };

// Três coisas boas com o porquê, energia × dreno, adiado, corpo: um lado diferente por dia.
const PERGUNTAS_NOITE = [
  "O que te deu energia hoje e o que te drenou?",
  "Uma coisa boa de hoje e por que ela aconteceu?",
  "O que você adiou hoje? O que estava pesando nisso?",
  "Como seu corpo ficou hoje (sono, comida, cansaço)?",
  "O que você faria diferente se hoje começasse de novo?",
  "Com quem você falou hoje e como se sentiu depois?",
  "Do que você se orgulha de hoje, mesmo que pequeno?",
];

export function perguntaDaNoite(dia: Date): string {
  return PERGUNTAS_NOITE[Math.floor(dia.getTime() / 86_400_000) % PERGUNTAS_NOITE.length];
}

/** "4 tranquilo" → otimo/bom/neutro/ruim/pessimo; sem nota no começo → null. */
export function humorDaNota(texto: string): string | null {
  const m = texto.trim().match(/^([1-5])(?!\d|[,.]\d)/);
  return m ? ["pessimo", "ruim", "neutro", "bom", "otimo"][Number(m[1]) - 1] : null;
}

/** Texto da pergunta e marca que ela está esperando resposta. */
export async function perguntarDiario(tipo: "manha" | "noite", agora: Date): Promise<string> {
  const pergunta = tipo === "manha" ? "Como está seu dia começando?" : perguntaDaNoite(agora);
  const value = { tipo, pergunta, at: agora.getTime() };
  await prisma.flowState.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return tipo === "manha"
    ? "☀️ Bom dia! Como está seu dia começando?\nUma nota de *1 a 5* e uma palavra (ex.: _3 cansado_). Se não quiser, responda *hoje não*."
    : `🌙 Como terminou seu dia? Nota de *1 a 5*.\nE hoje: _${pergunta}_\nEscreve do seu jeito, vira o dia no diário. (*hoje não* também vale.)`;
}

async function pendente(): Promise<Pendente | null> {
  const r = await prisma.flowState.findUnique({ where: { key: KEY } });
  const p = r?.value as Pendente | undefined;
  return p && Date.now() - p.at < JANELA_MS ? p : null;
}
const limpar = () => prisma.flowState.deleteMany({ where: { key: KEY } });

/** "hoje não" logo depois da pergunta. */
export async function applyCheckinSkip(text: string): Promise<string | null> {
  if (!/^\s*(hoje|agora)\s+n[aã]o\b/i.test(text) || !(await pendente())) return null;
  await limpar();
  return "Tudo bem 💚 Amanhã eu pergunto de novo.";
}

/** Resposta à pergunta (se ainda esperando e a mensagem é relato, não pergunta nem gasto): conteúdo e humor do diário. */
export async function respostaDoCheckin(text: string, tipoRota: string): Promise<{ content: string; mood: string | null } | null> {
  if ((tipoRota !== "chat" && tipoRota !== "diary") || /\?\s*$/.test(text)) return null;
  const p = await pendente();
  if (!p) return null;
  await limpar();
  return { content: `${p.tipo === "manha" ? "☀️" : "🌙"} ${p.pergunta}\n${text.trim()}`, mood: humorDaNota(text) };
}
