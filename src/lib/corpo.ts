// Corpo (pedido dele, 24/11/2026: "projeto para perder peso… preciso cuidar de mim"):
// peso, meta, dias de academia e quanto foi para besteira, bebida e delivery (das notas
// e dos lançamentos, sem ele digitar nada a mais). Tom de acompanhamento, sem sermão.

import { prisma } from "./prisma";
import { todayBRT } from "./dates";
import { brlMsg as brl } from "./format";
import { normalizeItemCategory } from "./finance-taxonomy";

const DIA = 86_400_000;
const kg = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const sinal = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${kg(Math.abs(v))}`;
const num = (s: string) => Number(s.replace(",", "."));
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

/** "hoje" (padrão), "ontem", "anteontem" ou "dia 20" → meio-dia desse dia. */
function diaDe(t: string): Date {
  const hoje = todayBRT();
  if (/\banteontem\b/i.test(t)) return new Date(hoje.getTime() - 2 * DIA);
  if (/\bontem\b/i.test(t)) return new Date(hoje.getTime() - DIA);
  const d = t.match(/\bdia\s+(\d{1,2})(?:\/(\d{1,2}))?\b/i);
  if (d) {
    const m = d[2] ? Number(d[2]) - 1 : hoje.getMonth();
    const r = new Date(hoje.getFullYear(), m, Number(d[1]), 12);
    return r > hoje ? new Date(r.getFullYear() - 1, r.getMonth(), r.getDate(), 12) : r;
  }
  return hoje;
}

export const PESO_RE = /^\s*(?:meu\s+)?peso\s*(?:de\s+)?(?:hoje|ontem|anteontem|dia\s+\d{1,2}(?:\/\d{1,2})?)?\s*:?\s*(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:kg|quilos?)?\s*(?:hoje|ontem|anteontem)?\s*$/i;
export const META_RE = /^\s*(?:minha\s+)?meta\s+(?:de\s+)?peso\s*(?:[eé]\s+)?:?\s*(\d{2,3}(?:[.,]\d)?)\s*(?:kg|quilos?)?\s*$/i;
export const ACADEMIA_RE = /^\s*(?:fui\s+(?:na|pra|para\s+a|[àa])\s+academia|academia(?:\s+feita|\s+ok)?|treinei|treino\s+(?:feito|ok))(?:\s+(?:hoje|ontem|anteontem|dia\s+\d{1,2}(?:\/\d{1,2})?))?\s*[.!]?\s*$/i;
export const STATUS_RE = /^\s*(?:como\s+(?:est[aá]|t[aá]|vai)\s+(?:o\s+)?(?:meu\s+)?(?:peso|corpo)|(?:meu\s+)?peso|corpo)\s*\??\s*$/i;

/** Comandos do Corpo pelo WhatsApp. null = não é com ela. */
export async function applyCorpoCommand(text: string): Promise<string | null> {
  const t = text.trim();
  if (t.length > 60) return null;

  const meta = t.match(META_RE);
  if (meta) {
    const v = num(meta[1]);
    if (!(v >= 40 && v <= 250)) return "🎯 Esse peso parece fora do normal. Manda de novo, ex.: *meta de peso 95*.";
    await prisma.corpoLog.create({ data: { kind: "meta", value: v, at: todayBRT() } });
    return `🎯 Meta anotada: *${kg(v)}*.\n\n${await corpoResumo()}`;
  }

  const peso = t.match(PESO_RE);
  if (peso) {
    const v = num(peso[1]);
    if (!(v >= 40 && v <= 250)) return "⚖️ Esse peso parece fora do normal. Manda de novo, ex.: *peso 108,5*.";
    const at = diaDe(t);
    // Um peso por dia: pesar de novo no mesmo dia troca o valor.
    const doDia = await prisma.corpoLog.findFirst({ where: { kind: "peso", at: { gte: new Date(at.getTime() - DIA / 2), lt: new Date(at.getTime() + DIA / 2) } } });
    if (doDia) await prisma.corpoLog.update({ where: { id: doDia.id }, data: { value: v } });
    else await prisma.corpoLog.create({ data: { kind: "peso", value: v, at } });
    return `⚖️ Peso de ${ddmm(at)} anotado: *${kg(v)}*.\n\n${await corpoResumo()}`;
  }

  if (ACADEMIA_RE.test(t)) {
    const at = diaDe(t);
    const ja = await prisma.corpoLog.findFirst({ where: { kind: "academia", at: { gte: new Date(at.getTime() - DIA / 2), lt: new Date(at.getTime() + DIA / 2) } } });
    if (!ja) await prisma.corpoLog.create({ data: { kind: "academia", at } });
    const semana = await diasDeAcademia(7);
    return `💪 ${ja ? "Já estava anotada" : "Academia anotada"} em ${ddmm(at)}. Nos últimos 7 dias: *${semana} dia(s)*.`;
  }

  if (/^\s*apaga\s+(?:o\s+)?(?:[uú]ltimo\s+)?peso\s*$/i.test(t)) {
    const ult = await prisma.corpoLog.findFirst({ where: { kind: "peso" }, orderBy: { at: "desc" } });
    if (!ult) return "⚖️ Não tem peso anotado.";
    await prisma.corpoLog.delete({ where: { id: ult.id } });
    return `🗑️ Apaguei o peso de ${ddmm(ult.at)} (${kg(ult.value ?? 0)}).`;
  }

  if (STATUS_RE.test(t)) return corpoResumo();
  return null;
}

async function diasDeAcademia(dias: number): Promise<number> {
  return prisma.corpoLog.count({ where: { kind: "academia", at: { gt: new Date(todayBRT().getTime() - dias * DIA) } } });
}

/** Média dos pesos dos últimos 7 dias até `ate` (a balança varia 1 kg de um dia para o outro). */
export function mediaSemana(pesos: { at: Date; value: number }[], ate: Date): number | null {
  const janela = pesos.filter((p) => p.at.getTime() <= ate.getTime() && p.at.getTime() > ate.getTime() - 7 * DIA);
  return janela.length ? janela.reduce((s, p) => s + p.value, 0) / janela.length : null;
}

/** Resumo curto: último peso, tendência, meta e academia. */
export async function corpoResumo(): Promise<string> {
  const [pesosRaw, meta, academia7, academia28] = await Promise.all([
    prisma.corpoLog.findMany({ where: { kind: "peso", value: { not: null } }, orderBy: { at: "asc" } }),
    prisma.corpoLog.findFirst({ where: { kind: "meta" }, orderBy: { createdAt: "desc" } }),
    diasDeAcademia(7),
    diasDeAcademia(28),
  ]);
  const pesos = pesosRaw.map((p) => ({ at: p.at, value: p.value as number }));
  const linhas: string[] = ["💪 *Corpo*"];
  const ult = pesos.at(-1);
  if (!ult) {
    linhas.push("Ainda sem peso. Mande *peso 108,5* (de preferência de manhã, em jejum).");
  } else {
    const primeiro = pesos[0];
    linhas.push(`⚖️ Último peso: *${kg(ult.value)}* (${ddmm(ult.at)})${pesos.length > 1 ? ` · desde ${ddmm(primeiro.at)}: ${sinal(ult.value - primeiro.value)}` : ""}`);
    const agora = mediaSemana(pesos, ult.at);
    const antes = mediaSemana(pesos, new Date(ult.at.getTime() - 7 * DIA));
    if (agora != null && antes != null) linhas.push(`📉 Média da semana: ${kg(agora)} (${sinal(agora - antes)} na semana)`);
    if (meta?.value) {
      const falta = ult.value - meta.value;
      linhas.push(falta > 0 ? `🎯 Meta ${kg(meta.value)}: faltam *${kg(falta)}*` : `🎯 Meta ${kg(meta.value)}: 🏆 alcançada!`);
    }
  }
  if (!meta?.value) linhas.push("🎯 Sem meta ainda: mande *meta de peso 95*.");
  linhas.push(`🏋️ Academia: ${academia7} dia(s) nos últimos 7 · ${academia28} nos últimos 28`);
  return linhas.join("\n");
}

type Semana = { inicio: string; besteira: number; delivery: number; academia: number; peso: number | null };

/** Segunda-feira da semana de `d` (meio-dia). */
function segunda(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7), 12);
}

/**
 * Besteira (inclui bebida alcoólica) e delivery por semana: lançamentos dessas categorias
 * mais os itens "Besteira" das notas de mercado. Pela data da compra.
 */
async function comidaPorSemana(desde: Date): Promise<Map<string, { besteira: number; delivery: number }>> {
  const entries = await prisma.financeEntry.findMany({
    where: {
      type: "expense",
      NOT: { description: { contains: "(previsto)" } },
      OR: [{ purchaseDate: { gte: desde } }, { purchaseDate: null, date: { gte: desde } }],
    },
    select: { amount: true, category: true, subcategory: true, purchaseDate: true, date: true, invoiceItems: { select: { name: true, category: true, amount: true } } },
  });
  const out = new Map<string, { besteira: number; delivery: number }>();
  for (const e of entries) {
    const k = segunda(e.purchaseDate ?? e.date).toISOString().slice(0, 10);
    const s = out.get(k) ?? { besteira: 0, delivery: 0 };
    if (e.category === "Besteira") s.besteira += e.amount;
    else if (/delivery/i.test(e.subcategory)) s.delivery += e.amount;
    else if (e.invoiceItems.length) s.besteira += e.invoiceItems.filter((i) => i.amount > 0 && normalizeItemCategory(i) === "Besteira").reduce((t, i) => t + i.amount, 0);
    out.set(k, s);
  }
  return out;
}

/** Dados da aba Corpo. */
export async function corpoPainel() {
  const hoje = todayBRT();
  const desde = segunda(new Date(hoje.getTime() - 11 * 7 * DIA)); // 12 semanas
  const [pesosRaw, meta, academia, comida] = await Promise.all([
    prisma.corpoLog.findMany({ where: { kind: "peso", value: { not: null } }, orderBy: { at: "asc" } }),
    prisma.corpoLog.findFirst({ where: { kind: "meta" }, orderBy: { createdAt: "desc" } }),
    prisma.corpoLog.findMany({ where: { kind: "academia", at: { gte: desde } }, select: { at: true } }),
    comidaPorSemana(desde),
  ]);
  const pesos = pesosRaw.map((p) => ({ at: p.at, value: p.value as number }));
  const semanas: Semana[] = [];
  for (let s = desde; s <= hoje; s = new Date(s.getTime() + 7 * DIA)) {
    const k = s.toISOString().slice(0, 10);
    const fim = new Date(s.getTime() + 7 * DIA);
    const c = comida.get(k) ?? { besteira: 0, delivery: 0 };
    semanas.push({
      inicio: k,
      besteira: Math.round(c.besteira * 100) / 100,
      delivery: Math.round(c.delivery * 100) / 100,
      academia: academia.filter((a) => a.at >= s && a.at < fim).length,
      peso: mediaSemana(pesos, new Date(Math.min(fim.getTime() - 1, hoje.getTime() + DIA))),
    });
  }
  return {
    pesos: pesos.map((p) => ({ at: p.at.toISOString(), value: p.value })),
    meta: meta?.value ?? null,
    academia7: academia.filter((a) => a.at.getTime() > hoje.getTime() - 7 * DIA).length,
    semanas,
  };
}

/** Linha do resumo de domingo (vazia se ele ainda não usa o Corpo). */
export async function corpoLinhaSemana(): Promise<string> {
  const hoje = todayBRT();
  const inicio = new Date(hoje.getTime() - 7 * DIA);
  const [pesosRaw, academia, usa] = await Promise.all([
    prisma.corpoLog.findMany({ where: { kind: "peso", value: { not: null } }, orderBy: { at: "asc" } }),
    diasDeAcademia(7),
    prisma.corpoLog.count(),
  ]);
  if (!usa) return "";
  const pesos = pesosRaw.map((p) => ({ at: p.at, value: p.value as number }));
  const comida = [...(await comidaPorSemana(inicio)).values()].reduce((t, c) => t + c.besteira + c.delivery, 0);
  const agora = mediaSemana(pesos, hoje);
  const antes = mediaSemana(pesos, inicio);
  const peso = agora != null ? `peso ${kg(agora)}${antes != null ? ` (${sinal(agora - antes)})` : ""}` : "sem peso na semana";
  return `💪 *Corpo:* ${peso} · academia ${academia} dia(s) · besteira e delivery ${brl(comida)}`;
}
