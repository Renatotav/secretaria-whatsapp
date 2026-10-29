// "🔍 Seus padrões": cruza o humor do diário com os gastos, sem IA (pedido dele,
// 28/10/2026: "entender os padrões e sair deles"). Usado pelo cartão do Diário e
// pelo relatório de domingo. Tom: pista para se entender, nunca cobrança.

import { prisma } from "./prisma";
import { brl } from "./format";

export type DiaDiario = { dia: string; humor: string; texto: string };
export type GastoDia = { dia: string; valor: number; categoria: string };
export type Padroes = {
  registros: number;
  ruins: number;
  bons: number;
  diasPesados: string[];
  gatilhos: string[];
  gastoDepoisRuim: number | null;
  gastoMedio: number | null;
  frases: string[];
};

const DOW = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const RUIM = new Set(["ruim", "pessimo"]);
const BOM = new Set(["bom", "otimo"]);
// Palavras que não dizem nada sobre o motivo do dia.
const VAZIAS = new Set(["estava", "estou", "queria", "quero", "muito", "muita", "minha", "meu", "sinto", "porque", "depois", "ainda", "hoje", "ontem", "fiquei", "sobre", "tenho", "tinha", "estar", "mesmo", "quando", "coisa", "coisas", "bastante", "devido", "pouco", "agora", "outra", "outro", "fazer", "acho", "sendo", "dessa", "desse", "nesse", "nessa", "aquele", "aquela", "porem", "entao", "comigo", "sabado", "domingo", "segunda", "terca", "quarta", "quinta", "sexta"]);
// Compra grande e rara (a scooter) distorce a média do dia.
const COMPRA_RARA = 1000;

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const diaSeguinte = (dia: string) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

/** A conta em si (sem banco), para dar para testar. */
export function analisarPadroes(diario: DiaDiario[], gastos: GastoDia[]): Padroes {
  const ruins = diario.filter((d) => RUIM.has(d.humor));
  const bons = diario.filter((d) => BOM.has(d.humor)).length;

  const porDow = new Map<number, number>();
  for (const d of ruins) { const w = new Date(`${d.dia}T12:00:00Z`).getUTCDay(); porDow.set(w, (porDow.get(w) ?? 0) + 1); }
  const maxDow = Math.max(0, ...porDow.values());
  const diasPesados = maxDow >= 2 ? [...porDow.entries()].filter(([, n]) => n === maxDow).map(([w]) => DOW[w]) : [];

  // Conta sem acento, mostra como ele escreveu ("plantão").
  const pal = new Map<string, number>();
  const escrita = new Map<string, string>();
  for (const d of ruins) {
    const vistas = new Set<string>();
    for (const orig of d.texto.toLowerCase().match(/[a-zà-ú]{5,}/g) ?? []) {
      const w = semAcento(orig);
      if (VAZIAS.has(w) || vistas.has(w)) continue;
      vistas.add(w);
      pal.set(w, (pal.get(w) ?? 0) + 1);
      if (!escrita.has(w) || orig !== w) escrita.set(w, orig);
    }
  }
  const gatilhos = [...pal.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => escrita.get(w) ?? w);

  const porDia = new Map<string, number>();
  for (const g of gastos) if (g.valor < COMPRA_RARA) porDia.set(g.dia, (porDia.get(g.dia) ?? 0) + g.valor);
  const dias = [...porDia.values()];
  const gastoMedio = dias.length ? dias.reduce((a, v) => a + v, 0) / dias.length : null;
  const depois = ruins.map((d) => porDia.get(diaSeguinte(d.dia)) ?? 0);
  const gastoDepoisRuim = depois.length ? depois.reduce((a, v) => a + v, 0) / depois.length : null;

  const frases: string[] = [];
  if (diario.length >= 5 && bons * 4 < diario.length) frases.push(`Você escreve mais nos dias difíceis (${ruins.length} de ${diario.length}). Uma linha nos dias bons mostraria o que te faz bem.`);
  if (diasPesados.length) frases.push(`Os dias pesados caem mais em ${diasPesados.join(" e ")}.`);
  if (gatilhos.length) frases.push(`Palavras que voltam nos dias ruins: ${gatilhos.join(", ")}.`);
  if (gastoDepoisRuim != null && gastoMedio != null && ruins.length >= 3)
    frases.push(gastoDepoisRuim > gastoMedio * 1.5
      ? `Depois de um dia ruim o gasto sobe (${brl(gastoDepoisRuim)} contra ${brl(gastoMedio)} num dia comum).`
      : `O humor não está puxando seus gastos: depois de um dia ruim você gasta ${brl(gastoDepoisRuim)}, num dia comum ${brl(gastoMedio)}.`);
  return { registros: diario.length, ruins: ruins.length, bons, diasPesados, gatilhos, gastoDepoisRuim, gastoMedio, frases };
}

/** Lê o diário e os gastos (data da compra) desde o primeiro registro. */
export async function seusPadroes(): Promise<Padroes> {
  const diario = await prisma.diaryEntry.findMany({ orderBy: { date: "asc" }, select: { date: true, mood: true, content: true } });
  const desde = diario[0]?.date ?? new Date();
  const lancs = await prisma.financeEntry.findMany({
    where: { type: "expense", NOT: { description: { contains: "previsto" } }, OR: [{ purchaseDate: { gte: desde } }, { purchaseDate: null, date: { gte: desde } }] },
    select: { amount: true, category: true, description: true, purchaseDate: true, date: true },
  });
  const gastos = lancs
    // Série de parcelas conta só na compra (parcela 1), não em cada fatura.
    .filter((g) => !/parcela \d+\/\d+/i.test(g.description) || /parcela 1\//i.test(g.description))
    .map((g) => ({ dia: (g.purchaseDate ?? g.date).toISOString().slice(0, 10), valor: g.amount, categoria: g.category }));
  return analisarPadroes(diario.map((d) => ({ dia: d.date.toISOString().slice(0, 10), humor: d.mood, texto: d.content })), gastos);
}
