// Corpo (pedido dele, 24/11/2026: "projeto para perder peso… preciso cuidar de mim"):
// peso, meta, dias de academia e quanto foi para besteira, bebida e delivery (das notas
// e dos lançamentos, sem ele digitar nada a mais). Tom de acompanhamento, sem sermão.

import { prisma } from "./prisma";
import { todayBRT } from "./dates";
import { brlMsg as brl } from "./format";
import { normalizeItemCategory } from "./finance-taxonomy";
import { applyTreinoCommand, treinoPainel } from "./treino";
import { comprasNutriPorSemana } from "./nutri";

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
export const PERFIL_RE = /^\s*(?:meu\s+)?perfil\b/i;

/** "perfil 1,78 m 38 anos homem" (qualquer ordem) → altura (m), idade, sexo; null se faltar algo. */
export function lePerfil(t: string): { altura: number; idade: number; sexo: "M" | "F" } | null {
  const alt = t.match(/\b([12][.,]\d{1,2})\s*m?\b/) ?? t.match(/\b(1\d{2}|2[0-2]\d)\s*cm\b/i);
  const id = t.match(/\b(\d{2})\s*anos\b/i);
  const sx = /\b(homem|masculino|m)\b/i.test(t) ? "M" : /\b(mulher|feminino|f)\b/i.test(t) ? "F" : null;
  if (!alt || !id || !sx) return null;
  const altura = /cm/i.test(alt[0]) ? Number(alt[1]) / 100 : num(alt[1]);
  const idade = Number(id[1]);
  return altura >= 1.2 && altura <= 2.3 && idade >= 12 && idade <= 100 ? { altura, idade, sexo: sx } : null;
}

export const STATUS_RE = /^\s*(?:como\s+(?:est[aá]|t[aá]|vai)\s+(?:o\s+)?(?:meu\s+)?(?:peso|corpo)|(?:meu\s+)?peso|corpo)\s*\??\s*$/i;

// Cardio: MET de cada atividade (gasto ≈ MET × peso × horas) e o ritmo para quando só vem a distância.
const CARDIO: [RegExp, string, number, number][] = [
  [/corri|corrida|correr/, "corrida", 9.8, 6],
  [/caminh|andei|caminhada/, "caminhada", 3.5, 12],
  [/pedal|bike|bicicleta|ciclismo/, "bike", 7.5, 3],
  [/esteira/, "esteira", 5, 10],
  [/nad|natac/, "natação", 8, 30],
  [/eliptic|transport/, "elíptico", 5, 8],
];
/** "corri 5 km", "esteira 30 min", "pedalei 1h" → atividade, minutos, km (null se não for cardio). */
export function leCardio(t: string): { atividade: string; met: number; min: number; km: number | null } | null {
  const f = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (f.length > 60 || /\b(r\$|reais|pix|cartao|conto|uber|99|taxi|onibus)\b/.test(f)) return null;
  const tipo = CARDIO.find(([re]) => re.test(f));
  if (!tipo || !/^(fiz\s+|hoje\s+)?\S+/.test(f)) return null;
  const km = f.match(/(\d+(?:[.,]\d+)?)\s*km\b/);
  const min = f.match(/(\d+(?:[.,]\d+)?)\s*(min|minutos?|h|horas?)\b/);
  if (!km && !min) return null;
  const kmN = km ? Number(km[1].replace(",", ".")) : null;
  const minN = min ? Number(min[1].replace(",", ".")) * (/^h/.test(min[2]) ? 60 : 1) : kmN! * tipo[3];
  return minN > 0 && minN <= 600 ? { atividade: tipo[1], met: tipo[2], min: Math.round(minN), km: kmN } : null;
}

/** Comandos do Corpo pelo WhatsApp. null = não é com ela. */
export async function applyCorpoCommand(text: string): Promise<string | null> {
  const treino = await applyTreinoCommand(text);
  if (treino) return treino;
  const t = text.trim();
  if (t.length > 60) return null;

  if (PERFIL_RE.test(t)) {
    const p = lePerfil(t);
    if (!p) return "📏 Para as contas de IMC e calorias, mande assim: *perfil 1,78 m 38 anos homem*.";
    await prisma.corpoLog.create({ data: { kind: "perfil", value: p.altura, note: JSON.stringify({ idade: p.idade, sexo: p.sexo, em: todayBRT().getFullYear() }) } });
    return `📏 Perfil anotado: ${p.altura.toLocaleString("pt-BR")} m, ${p.idade} anos.\n\n${await corpoResumo()}`;
  }

  const cardio = leCardio(t);
  if (cardio) {
    const ultPeso = (await prisma.corpoLog.findFirst({ where: { kind: "peso", value: { not: null } }, orderBy: { at: "desc" } }))?.value ?? 80;
    const kcal = Math.round((cardio.met * ultPeso * cardio.min) / 60);
    const at = todayBRT();
    await prisma.corpoLog.create({ data: { kind: "cardio", value: kcal, at, note: JSON.stringify({ atividade: cardio.atividade, min: cardio.min, km: cardio.km }) } });
    // Cardio também conta como dia ativo.
    const ja = await prisma.corpoLog.findFirst({ where: { kind: "academia", at: { gte: new Date(at.getTime() - DIA / 2), lt: new Date(at.getTime() + DIA / 2) } } });
    if (!ja) await prisma.corpoLog.create({ data: { kind: "academia", at, note: "cardio" } });
    return `🏃 ${cardio.atividade[0].toUpperCase()}${cardio.atividade.slice(1)} anotada: ${cardio.min} min${cardio.km ? ` · ${cardio.km.toLocaleString("pt-BR")} km` : ""} · queimou ~*${kcal.toLocaleString("pt-BR")} kcal*${ultPeso === 80 ? " (estimativa; mande seu peso para ficar certo)" : ""}.`;
  }

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

/** IMC e a faixa da OMS. */
export function imc(peso: number, altura: number): { valor: number; faixa: string } {
  const v = peso / (altura * altura);
  const faixa = v < 18.5 ? "abaixo do peso" : v < 25 ? "peso normal" : v < 30 ? "sobrepeso" : v < 35 ? "obesidade grau 1" : v < 40 ? "obesidade grau 2" : "obesidade grau 3";
  return { valor: Math.round(v * 10) / 10, faixa };
}

/**
 * Gasto do corpo por dia: TMB (Mifflin-St Jeor) × atividade, que sobe com os dias de academia
 * (média por semana nos últimos 28 dias). Meta = gasto − 500 kcal (~0,5 kg por semana), com piso.
 */
export function calorias(p: { peso: number; altura: number; idade: number; sexo: "M" | "F" }, academiaPorSemana: number) {
  const tmb = 10 * p.peso + 6.25 * p.altura * 100 - 5 * p.idade + (p.sexo === "M" ? 5 : -161);
  const fator = academiaPorSemana >= 5 ? 1.725 : academiaPorSemana >= 3 ? 1.55 : academiaPorSemana >= 1 ? 1.375 : 1.2;
  const gasto = tmb * fator;
  const meta = Math.max(gasto - 500, p.sexo === "M" ? 1500 : 1200);
  return { tmb: Math.round(tmb), fator, gasto: Math.round(gasto), meta: Math.round(meta / 10) * 10 };
}

/** kg por semana pela reta dos pesos dos últimos 28 dias (precisa de 3+ pesos em 7+ dias). */
export function tendencia(pesos: { at: Date; value: number }[], hoje: Date): number | null {
  const p = pesos.filter((x) => x.at.getTime() > hoje.getTime() - 28 * DIA);
  if (p.length < 3 || p.at(-1)!.at.getTime() - p[0].at.getTime() < 7 * DIA) return null;
  const xs = p.map((x) => x.at.getTime() / DIA), ys = p.map((x) => x.value);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0), vx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return vx ? (cov / vx) * 7 : null;
}

/** Perfil mais recente (a idade anda com o ano). */
async function perfil(): Promise<{ altura: number; idade: number; sexo: "M" | "F" } | null> {
  const r = await prisma.corpoLog.findFirst({ where: { kind: "perfil" }, orderBy: { createdAt: "desc" } });
  if (!r?.value) return null;
  const j = JSON.parse(r.note || "{}") as { idade?: number; sexo?: "M" | "F"; em?: number };
  return j.idade && j.sexo ? { altura: r.value, idade: j.idade + (todayBRT().getFullYear() - (j.em ?? todayBRT().getFullYear())), sexo: j.sexo } : null;
}

/** Números do corpo: IMC, calorias e previsão (null no que faltar dado). */
export async function corpoNumeros() {
  const hoje = todayBRT();
  const [pesosRaw, metaR, pf, acad28] = await Promise.all([
    prisma.corpoLog.findMany({ where: { kind: "peso", value: { not: null } }, orderBy: { at: "asc" } }),
    prisma.corpoLog.findFirst({ where: { kind: "meta" }, orderBy: { createdAt: "desc" } }),
    perfil(),
    diasDeAcademia(28),
  ]);
  const pesos = pesosRaw.map((p) => ({ at: p.at, value: p.value as number }));
  const ult = pesos.at(-1);
  const metaPeso = metaR?.value ?? null;
  const porSemana = tendencia(pesos, hoje);
  const kcal = ult && pf ? calorias({ peso: ult.value, ...pf }, acad28 / 4) : null;
  let previsao: string | null = null;
  if (ult && metaPeso != null && porSemana != null && porSemana < -0.05 && ult.value > metaPeso) {
    const semanas = (ult.value - metaPeso) / -porSemana;
    if (semanas < 520) previsao = new Date(hoje.getTime() + semanas * 7 * DIA).toISOString().slice(0, 10);
  }
  return { perfil: pf, imc: ult && pf ? imc(ult.value, pf.altura) : null, kcal, porSemana, previsao, academiaPorSemana: acad28 / 4 };
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
  const nums = await corpoNumeros();
  if (nums.porSemana != null) linhas.push(`📈 Ritmo das últimas semanas: ${sinal(nums.porSemana)} por semana${nums.previsao ? ` → chega na meta por volta de *${ddmm(new Date(nums.previsao + "T12:00:00"))}/${nums.previsao.slice(2, 4)}*` : ""}`);
  if (nums.imc) linhas.push(`📏 IMC ${nums.imc.valor.toLocaleString("pt-BR")} (${nums.imc.faixa})`);
  if (nums.kcal) linhas.push(`🔥 Seu corpo gasta ~${nums.kcal.gasto.toLocaleString("pt-BR")} kcal/dia · para perder ~0,5 kg/semana: ~*${nums.kcal.meta.toLocaleString("pt-BR")} kcal/dia*`);
  else if (ult) linhas.push("📏 Para IMC e calorias: *perfil 1,78 m 38 anos homem*.");
  linhas.push(`🏋️ Academia: ${academia7} dia(s) nos últimos 7 · ${academia28} nos últimos 28`);
  return linhas.join("\n");
}

type Semana = { inicio: string; besteira: number; delivery: number; academia: number; peso: number | null; kcal: number; proteina: number; cobertura: number | null };

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
  const [pesosRaw, meta, academia, comida, nutri] = await Promise.all([
    prisma.corpoLog.findMany({ where: { kind: "peso", value: { not: null } }, orderBy: { at: "asc" } }),
    prisma.corpoLog.findFirst({ where: { kind: "meta" }, orderBy: { createdAt: "desc" } }),
    prisma.corpoLog.findMany({ where: { kind: "academia", at: { gte: desde } }, select: { at: true } }),
    comidaPorSemana(desde),
    comprasNutriPorSemana(desde, segunda),
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
      kcal: Math.round(nutri.get(k)?.kcal ?? 0),
      proteina: Math.round(nutri.get(k)?.proteina ?? 0),
      // Parte dos itens de comida que deu para converter (o resto não tem equivalente ou tamanho).
      cobertura: nutri.get(k)?.itens ? Math.round((nutri.get(k)!.contados / nutri.get(k)!.itens) * 100) : null,
    });
  }
  return {
    numeros: await corpoNumeros(),
    // O que ele anotou que comeu, por dia (últimos 14).
    comidas: (await prisma.corpoLog.findMany({ where: { kind: "comida", at: { gte: new Date(hoje.getTime() - 14 * DIA) } }, orderBy: { at: "asc" } })).map((c) => ({ at: c.at.toISOString(), kcal: c.value ?? 0, texto: (JSON.parse(c.note || "{}") as { texto?: string }).texto ?? "" })),
    treino: await treinoPainel(),
    pesos: pesos.map((p) => ({ at: p.at.toISOString(), value: p.value })),
    meta: meta?.value ?? null,
    academia7: academia.filter((a) => a.at.getTime() > hoje.getTime() - 7 * DIA).length,
    // Os dias em que foi, nos últimos 7 (para marcar o dia certo, não só contar).
    academiaDias: academia.filter((a) => a.at.getTime() > hoje.getTime() - 7 * DIA).map((a) => a.at.toISOString().slice(0, 10)),
    hoje: hoje.toISOString().slice(0, 10),
    cardioHoje: (await prisma.corpoLog.findMany({ where: { kind: "cardio", at: { gte: new Date(hoje.getTime() - DIA / 2), lt: new Date(hoje.getTime() + DIA / 2) } } })).reduce((t, c) => t + (c.value ?? 0), 0),
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
