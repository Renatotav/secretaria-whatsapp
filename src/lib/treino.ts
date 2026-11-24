// Treinos (24/11/2026, parte do Corpo): ele manda "supino 3x10 40kg" e ela guarda, compara com a
// última vez, avisa recorde e estima a força (1RM). Plano da semana: "plano seg peito, ter costas…".

import { prisma } from "./prisma";
import { todayBRT } from "./dates";

const DIA = 86_400_000;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const kg = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

// Nomes que ele pode escrever de jeitos diferentes viram um só (o histórico e o recorde juntam).
const APELIDOS: [RegExp, string][] = [
  [/^supino( reto)?( com barra)?$/, "supino"],
  [/^agachamento( livre)?$/, "agachamento"],
  [/^(leg ?press|legpress)( 45)?$/, "leg press"],
  [/^(puxada|pulldown|puxador)( frente| alta)?$/, "puxada"],
  [/^(rosca|rosca direta)$/, "rosca direta"],
  [/^(desenvolvimento|desenv)( com halter| militar)?$/, "desenvolvimento"],
  [/^(cadeira extensora|extensora)$/, "cadeira extensora"],
  [/^(mesa flexora|flexora)$/, "mesa flexora"],
];
export function nomeExercicio(s: string): string {
  const f = fold(s);
  return APELIDOS.find(([re]) => re.test(f))?.[1] ?? f;
}

/** 1RM estimado (Epley); só até 12 repetições, acima disso a conta não vale. */
export const umRM = (kgs: number, reps: number) => (reps >= 1 && reps <= 12 ? kgs * (1 + reps / 30) : null);

type Serie = { exercicio: string; series: number; reps: number | null; kg: number | null; segundos: number | null };

const SERIE_RE = /^([\p{L}][\p{L}\s]{1,40}?)\s+(\d{1,2})\s*x\s*(\d{1,3})(\s*s(?:eg)?\b)?(?:\s*(?:x|com|de|@)?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kg|quilos?)?)?\s*$/iu;
const SERIE_KG_PRIMEIRO_RE = /^([\p{L}][\p{L}\s]{1,40}?)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:kg|quilos?)\s+(\d{1,2})\s*x\s*(\d{1,3})\s*$/iu;

/** "supino 3x10 40kg", "supino 40kg 3x10", "prancha 3x40s", "barra fixa 3x8" (uma por linha). null se alguma linha não for série. */
export function leSeries(text: string): Serie[] | null {
  // Parcelado ("fone em 3x de 100 no cartão") e gasto nunca são treino.
  if (/\b(r\$|reais|pix|cart[aã]o|d[eé]bito|parcel|vezes|no vr|conto)\b|\d+\s*x\s+de\b/i.test(text)) return null;
  const linhas = text.split(/\n|;|,\s*(?=\p{L})/u).map((l) => l.trim()).filter(Boolean);
  if (!linhas.length || linhas.length > 15) return null;
  const out: Serie[] = [];
  for (const l of linhas) {
    const a = l.match(SERIE_RE);
    const b = a ? null : l.match(SERIE_KG_PRIMEIRO_RE);
    if (!a && !b) return null;
    if (a) {
      const porTempo = !!a[4];
      out.push({ exercicio: nomeExercicio(a[1]), series: Number(a[2]), reps: porTempo ? null : Number(a[3]), segundos: porTempo ? Number(a[3]) : null, kg: a[5] ? Number(a[5].replace(",", ".")) : null });
    } else {
      out.push({ exercicio: nomeExercicio(b![1]), series: Number(b![3]), reps: Number(b![4]), segundos: null, kg: Number(b![2].replace(",", ".")) });
    }
  }
  return out.every((s) => s.series >= 1 && s.series <= 12 && (s.reps == null || s.reps <= 100) && (s.kg == null || s.kg <= 500)) ? out : null;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const DIAS_NOME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "plano seg peito e tríceps, ter costas, qua perna" → {1: "peito e tríceps", ...}. */
export function lePlano(text: string): Record<number, string> | null {
  const m = text.trim().match(/^\s*(?:meu\s+)?plano(?:\s+de\s+treino)?\s*:?\s*([\s\S]+)$/i);
  if (!m) return null;
  const out: Record<number, string> = {};
  for (const parte of m[1].split(/[,;\n]+/)) {
    const p = fold(parte).match(/^(dom|seg|ter|qua|qui|sex|sab)\w*\s*:?\s*/);
    // O dia sai do texto sem acento; o treino fica como ele escreveu ("tríceps").
    if (p) out[DIAS.indexOf(p[1])] = parte.trim().slice(p[0].length).trim();
  }
  return Object.keys(out).length ? out : null;
}

async function planoSalvo(): Promise<Record<number, string>> {
  const r = await prisma.corpoLog.findFirst({ where: { kind: "plano" }, orderBy: { createdAt: "desc" } });
  return r ? (JSON.parse(r.note || "{}") as Record<number, string>) : {};
}

/** Comandos de treino pelo WhatsApp. null = não é com ela. */
export async function applyTreinoCommand(text: string): Promise<string | null> {
  const t = text.trim();
  if (t.length > 600) return null;

  const plano = lePlano(t);
  if (plano) {
    await prisma.corpoLog.create({ data: { kind: "plano", note: JSON.stringify(plano) } });
    return `📋 Plano da semana anotado:\n${Object.entries(plano).map(([d, v]) => `• ${DIAS_NOME[Number(d)]}: ${v}`).join("\n")}\nPergunte *treino de hoje?* no dia.`;
  }

  if (/^\s*(?:qual\s+(?:[eé]\s+)?(?:o\s+)?)?treino\s+(?:de\s+)?(?:hoje|amanh[aã])\s*\??\s*$/i.test(t)) {
    const amanha = /amanh/i.test(t);
    const d = new Date(todayBRT().getTime() + (amanha ? DIA : 0));
    const p = await planoSalvo();
    const doDia = p[d.getDay()];
    if (!doDia) return Object.keys(p).length ? `📋 ${amanha ? "Amanhã" : "Hoje"} (${DIAS_NOME[d.getDay()]}) está livre no seu plano.` : "📋 Ainda sem plano. Mande, por exemplo: *plano seg peito e tríceps, ter costas e bíceps, qua perna*.";
    // O que ele fez da última vez nesse mesmo dia da semana, para já saber a carga.
    const ult = await prisma.treinoSerie.findMany({ where: { at: { gte: new Date(d.getTime() - 35 * DIA), lt: todayBRT() } }, orderBy: { at: "desc" } });
    const mesmoDia = ult.filter((s) => s.at.getDay() === d.getDay());
    const ultDia = mesmoDia[0] ? mesmoDia.filter((s) => s.at.getTime() === mesmoDia[0].at.getTime()) : [];
    return `📋 ${amanha ? "Amanhã" : "Hoje"} (${DIAS_NOME[d.getDay()]}): *${doDia}*${ultDia.length ? `\nDa última vez (${ddmm(ultDia[0].at)}):\n${ultDia.map((s) => `• ${s.exercicio}: ${descreve(s)}`).join("\n")}` : ""}`;
  }

  if (/^\s*(?:meus\s+)?recordes?\s*\??\s*$/i.test(t)) return recordes();

  const series = leSeries(t);
  if (!series) return null;
  const hoje = todayBRT();
  const linhas: string[] = [];
  for (const s of series) {
    const antes = await prisma.treinoSerie.findMany({ where: { exercicio: s.exercicio, at: { lt: new Date(hoje.getTime() - DIA / 2) } }, orderBy: { at: "desc" } });
    await prisma.treinoSerie.create({ data: { ...s, at: hoje } });
    const ultima = antes[0];
    const rm = s.kg != null && s.reps != null ? umRM(s.kg, s.reps) : null;
    const melhorAntes = Math.max(0, ...antes.map((a) => (a.kg != null && a.reps != null ? umRM(a.kg, a.reps) ?? 0 : 0)));
    const recorde = rm != null && antes.length > 0 && rm > melhorAntes + 0.01;
    linhas.push(
      `• *${s.exercicio}*: ${descreve(s)}` +
        (ultima ? ` (antes: ${descreve(ultima)} em ${ddmm(ultima.at)})` : " (primeira vez)") +
        (recorde ? " 🏆 recorde!" : "") +
        (rm != null ? ` · força ~${kg(Math.round(rm))}` : ""),
    );
  }
  // Treino registrado = dia de academia (um por dia).
  const ja = await prisma.corpoLog.findFirst({ where: { kind: "academia", at: { gte: new Date(hoje.getTime() - DIA / 2), lt: new Date(hoje.getTime() + DIA / 2) } } });
  if (!ja) await prisma.corpoLog.create({ data: { kind: "academia", at: hoje } });
  return `🏋️ Treino de ${ddmm(hoje)} anotado:\n${linhas.join("\n")}\n_Força = carga máxima estimada para 1 repetição._`;
}

function descreve(s: { series: number; reps: number | null; kg: number | null; segundos: number | null }): string {
  if (s.segundos != null) return `${s.series}×${s.segundos}s${s.kg ? ` com ${kg(s.kg)}` : ""}`;
  return `${s.series}×${s.reps}${s.kg != null ? ` com ${kg(s.kg)}` : ""}`;
}

/** Melhor força estimada de cada exercício. */
async function recordes(): Promise<string> {
  const todas = await prisma.treinoSerie.findMany({ orderBy: { at: "asc" } });
  if (!todas.length) return "🏋️ Ainda sem treino anotado. Mande, por exemplo: *supino 3x10 40kg*.";
  const best = new Map<string, { rm: number; s: (typeof todas)[number] }>();
  for (const s of todas) {
    const rm = s.kg != null && s.reps != null ? umRM(s.kg, s.reps) : null;
    if (rm != null && rm > (best.get(s.exercicio)?.rm ?? 0)) best.set(s.exercicio, { rm, s });
  }
  if (!best.size) return "🏋️ Ainda sem série com carga para ter recorde.";
  return `🏆 *Seus recordes* (força estimada)\n${[...best.entries()].sort((a, b) => b[1].rm - a[1].rm).map(([e, b]) => `• ${e}: ~${kg(Math.round(b.rm))} (${descreve(b.s)} em ${ddmm(b.s.at)})`).join("\n")}`;
}

/** Para a aba: evolução da força por exercício e o plano. */
export async function treinoPainel() {
  const todas = await prisma.treinoSerie.findMany({ orderBy: { at: "asc" } });
  const porEx = new Map<string, { at: string; rm: number | null; desc: string }[]>();
  for (const s of todas) {
    const l = porEx.get(s.exercicio) ?? [];
    l.push({ at: s.at.toISOString(), rm: s.kg != null && s.reps != null ? umRM(s.kg, s.reps) : null, desc: descreve(s) });
    porEx.set(s.exercicio, l);
  }
  const exercicios = [...porEx.entries()].map(([nome, h]) => {
    const rms = h.map((x) => x.rm).filter((x): x is number => x != null);
    return { nome, vezes: h.length, ultima: h.at(-1)!, recorde: rms.length ? Math.max(...rms) : null, historico: h.slice(-12) };
  });
  exercicios.sort((a, b) => b.ultima.at.localeCompare(a.ultima.at));
  const plano = await planoSalvo();
  return { exercicios, plano: Object.entries(plano).map(([d, v]) => ({ dia: DIAS_NOME[Number(d)], treino: v })) };
}
