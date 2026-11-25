// Treinos (24/11/2026, parte do Corpo): ele manda "supino 3x10 40kg" e ela guarda, compara com a
// última vez, avisa recorde e estima a força (1RM). Plano da semana: "plano seg peito, ter costas…".

import { prisma } from "./prisma";
import { todayBRT } from "./dates";
import { acharExercicio } from "./exercicios";

const DIA = 86_400_000;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const kg = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const ddmm = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

// Nome escrito por ele ("supino", "leg 45") → nome da biblioteca ("Supino reto com barra"), para o
// histórico e o recorde juntarem; desconhecido fica como ele escreveu (com a 1ª letra maiúscula).
export function nomeExercicio(s: string): string {
  const e = acharExercicio(s);
  const t = s.trim().replace(/\s+/g, " ");
  return e?.nome ?? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// Grupo muscular: o da biblioteca; nome livre cai na regra por palavra.
const GRUPOS_RE: [RegExp, string][] = [
  [/supino|crucifixo|peck|fly|flexao|paralela/, "Peito"],
  [/puxada|remada|barra fixa|pulldown|pull|serrote|terra/, "Costas"],
  [/agachamento|leg|extensora|flexora|stiff|afundo|hack/, "Pernas"],
  [/gluteo|elevacao pelvica|abdutora/, "Glúteos"],
  [/panturrilha/, "Panturrilha"],
  [/desenvolvimento|elevacao lateral|elevacao frontal|ombro|arnold|encolhimento/, "Ombros"],
  [/rosca|biceps|martelo/, "Bíceps"],
  [/triceps|frances|testa|mergulho|corda|coice/, "Tríceps"],
  [/prancha|abdominal|abdomen|crunch|infra|obliquo/, "Abdômen"],
];
export const grupoDo = (ex: string) => acharExercicio(ex)?.grupo ?? GRUPOS_RE.find(([re]) => re.test(fold(ex)))?.[1] ?? "Outros";
const grande = (ex: string) => acharExercicio(ex)?.grande ?? /agachamento|leg|stiff|terra|hack|gluteo|elevacao pelvica/.test(fold(ex));

/**
 * Próxima vez (dupla progressão, como nos apps de academia): fechou 12 repetições → sobe a carga
 * (+2,5 kg; +5 kg em perna) e volta para 8; senão, +1 repetição com a mesma carga. Prancha: +5 s.
 */
export function proximaVez(s: { exercicio: string; series: number; reps: number | null; kg: number | null; segundos: number | null }): string | null {
  if (s.segundos != null) return `${s.series}×${s.segundos + 5}s`;
  if (s.reps == null) return null;
  if (s.kg == null) return `${s.series}×${s.reps + 1}`;
  if (s.reps >= 12) return `${s.series}×8 com ${kg(s.kg + (grande(s.exercicio) ? 5 : 2.5))}`;
  return `${s.series}×${s.reps + 1} com ${kg(s.kg)}`;
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
    // A rotina da aba Treino manda; o "plano …" antigo do WhatsApp fica de reserva.
    const rotina = await prisma.rotina.findFirst({ where: { ativa: true, dia: d.getDay() }, orderBy: { updatedAt: "desc" } });
    if (rotina) {
      const itens = rotina.itens as unknown as { exercicio: string; series: number; repMin: number; repMax: number; segundos?: number | null }[];
      return `📋 ${amanha ? "Amanhã" : "Hoje"} (${DIAS_NOME[d.getDay()]}): *${rotina.nome}*\n${itens.map((i) => `• ${i.exercicio}: ${i.series}×${i.segundos ? `${i.segundos}s` : `${i.repMin}–${i.repMax}`}`).join("\n")}\nNa aba 🏋️ Treino já estão as cargas sugeridas e o descanso.`;
    }
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
        (rm != null ? ` · força ~${kg(Math.round(rm))}` : "") +
        (proximaVez(s) ? `\n   ➡️ próxima vez: ${proximaVez(s)}` : ""),
    );
  }
  // Treino registrado = dia de academia (um por dia).
  const ja = await prisma.corpoLog.findFirst({ where: { kind: "academia", at: { gte: new Date(hoje.getTime() - DIA / 2), lt: new Date(hoje.getTime() + DIA / 2) } } });
  if (!ja) await prisma.corpoLog.create({ data: { kind: "academia", at: hoje } });
  const g = await gruposDaSemana();
  return `🏋️ Treino de ${ddmm(hoje)} anotado:\n${linhas.join("\n")}\n💪 Semana: ${g.feitos.map(([n, v]) => `${n} ${v}×`).join(" · ")}${g.faltam.length ? ` · faltou: ${g.faltam.join(", ")}` : ""}\n_Força = carga máxima estimada para 1 repetição._`;
}

const PRINCIPAIS = ["Peito", "Costas", "Pernas", "Ombros", "Bíceps", "Tríceps"];
export { grande };
/** Quantos dias cada grupo muscular foi treinado nos últimos 7 dias, e quais ficaram de fora. */
export async function gruposDaSemana(): Promise<{ feitos: [string, number][]; faltam: string[] }> {
  const series = await prisma.treinoSerie.findMany({ where: { at: { gt: new Date(todayBRT().getTime() - 7 * DIA) } }, select: { exercicio: true, at: true } });
  const dias = new Map<string, Set<string>>();
  for (const s of series) {
    const g = grupoDo(s.exercicio);
    dias.set(g, (dias.get(g) ?? new Set()).add(s.at.toISOString().slice(0, 10)));
  }
  const feitos = [...dias.entries()].map(([g, d]) => [g, d.size] as [string, number]).sort((a, b) => b[1] - a[1]);
  return { feitos, faltam: PRINCIPAIS.filter((g) => !dias.has(g)) };
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
  return { grupos: await gruposDaSemana(), exercicios: exercicios.map((e) => ({ ...e, grupo: grupoDo(e.nome) })), plano: Object.entries(plano).map(([d, v]) => ({ dia: DIAS_NOME[Number(d)], treino: v })) };
}
