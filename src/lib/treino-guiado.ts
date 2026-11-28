// Treino guiado (24/11/2026, aba Treino — pedido dele: "quero completo"). Ideias de apps de academia,
// código nosso: rotina por dia da semana, carga sugerida (dupla progressão por faixa de repetições,
// alívio de 10% depois de 3 treinos parado), série a série com recorde na hora, e estatísticas.

import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { todayBRT } from "./dates";
import { EXERCICIOS, GRUPOS, SERIES_SEMANA, acharExercicio } from "./exercicios";
import { grande, grupoDo, nomeExercicio, umRM } from "./treino";

const DIA = 86_400_000;
export type ItemRotina = { exercicio: string; series: number; repMin: number; repMax: number; descanso: number; segundos?: number | null };
type Serie = { id: string; at: Date; exercicio: string; reps: number | null; kg: number | null; segundos: number | null; sessaoId: string | null; ordem: number | null; series: number; rir?: number | null; createdAt?: Date };

const arred = (v: number) => Math.round(v / 2.5) * 2.5;

/** Rotina válida vinda do painel (nomes viram os da biblioteca, números dentro do razoável). */
export function limpaItens(itens: unknown): ItemRotina[] {
  if (!Array.isArray(itens)) return [];
  return itens.slice(0, 20).flatMap((x) => {
    const i = x as Partial<ItemRotina>;
    if (!i?.exercicio || typeof i.exercicio !== "string") return [];
    const series = Math.min(10, Math.max(1, Math.round(Number(i.series) || 3)));
    const repMin = Math.min(50, Math.max(1, Math.round(Number(i.repMin) || 8)));
    const repMax = Math.min(60, Math.max(repMin, Math.round(Number(i.repMax) || 12)));
    const descanso = Math.min(600, Math.max(15, Math.round(Number(i.descanso) || 90)));
    const tempo = acharExercicio(i.exercicio)?.tempo;
    return [{ exercicio: nomeExercicio(i.exercicio), series, repMin, repMax, descanso, segundos: tempo ? Math.max(5, Math.round(Number(i.segundos) || 30)) : null }];
  });
}

/** Sessões anteriores do exercício (mais nova primeiro): séries agrupadas por dia/sessão. */
function sessoesDo(series: Serie[]): { dia: string; sets: Serie[] }[] {
  const m = new Map<string, Serie[]>();
  for (const s of series) {
    const k = s.sessaoId ?? s.at.toISOString().slice(0, 10);
    m.set(k, [...(m.get(k) ?? []), s]);
  }
  return [...m.values()]
    .map((sets) => ({ dia: sets[0].at.toISOString().slice(0, 10), sets: [...sets].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).flatMap((x) => Array.from({ length: x.sessaoId ? 1 : x.series }, () => x)) }))
    .sort((a, b) => b.dia.localeCompare(a.dia));
}

/**
 * Carga e repetições sugeridas para hoje.
 * - Fechou o topo da faixa em todas as séries → sobe a carga (+2,5; +5 nos grandes) e volta ao início da faixa.
 * - 3 treinos seguidos com a mesma carga sem ganhar repetição → alivia 10% (deload).
 * - Senão, mesma carga, buscando +1 repetição.
 */
export function sugestao(item: ItemRotina, anteriores: { sets: Serie[] }[]): { kg: number | null; reps: number; motivo: string } {
  const ult = anteriores[0];
  if (!ult?.sets.length) return { kg: null, reps: item.repMin, motivo: "primeira vez: escolha uma carga que dê para fazer as repetições com boa forma" };
  const cargas = ult.sets.map((s) => s.kg ?? 0);
  const carga = Math.max(...cargas);
  if (item.segundos != null) return { kg: carga || null, reps: 0, motivo: "por tempo" };
  const todasNoTopo = ult.sets.length >= item.series && ult.sets.every((s) => (s.reps ?? 0) >= item.repMax);
  if (todasNoTopo && carga > 0) return { kg: carga + (grande(item.exercicio) ? 5 : 2.5), reps: item.repMin, motivo: `fechou ${item.repMax} em todas: sobe a carga` };
  // "fácil" (RIR ≥ 3) em todas as séries, dentro da faixa: dá para subir mesmo sem chegar no topo.
  const todasFaceis = ult.sets.length >= item.series && ult.sets.every((s) => (s.rir ?? -1) >= 3 && (s.reps ?? 0) >= item.repMin);
  if (todasFaceis && carga > 0) return { kg: carga + (grande(item.exercicio) ? 5 : 2.5), reps: item.repMin, motivo: "da última vez estava fácil: sobe a carga" };
  const total = (x: { sets: Serie[] }) => x.sets.reduce((t, s) => t + (s.reps ?? 0), 0);
  const tres = anteriores.slice(0, 3);
  const parado = tres.length === 3 && tres.every((x) => Math.max(...x.sets.map((s) => s.kg ?? 0)) === carga) && total(tres[0]) <= total(tres[2]);
  if (parado && carga > 0) return { kg: arred(carga * 0.9), reps: item.repMax, motivo: "3 treinos parado na mesma carga: alivia 10% e volta a subir" };
  const melhor = Math.max(...ult.sets.map((s) => s.reps ?? 0));
  return { kg: carga || null, reps: Math.min(item.repMax, melhor + 1), motivo: "mesma carga, buscando +1 repetição" };
}

const melhorRM = (sets: { kg: number | null; reps: number | null }[]) => Math.max(0, ...sets.map((s) => (s.kg != null && s.reps != null ? umRM(s.kg, s.reps) ?? 0 : 0)));

/** O que a aba precisa: biblioteca, rotinas, sessão de hoje (com sugestões) e estatísticas. */
export async function treinoAba(rotinaId?: string | null) {
  const hoje = todayBRT();
  const [rotinas, proprios, series] = await Promise.all([
    prisma.rotina.findMany({ where: { ativa: true }, orderBy: [{ dia: "asc" }, { createdAt: "asc" }] }),
    prisma.exercicioProprio.findMany({ orderBy: { nome: "asc" } }),
    prisma.treinoSerie.findMany({ orderBy: { at: "desc" } }) as Promise<Serie[]>,
  ]);
  const porEx = new Map<string, Serie[]>();
  for (const s of series) porEx.set(s.exercicio, [...(porEx.get(s.exercicio) ?? []), s]);

  const doDia = rotinas.find((r) => r.id === rotinaId) ?? rotinas.find((r) => r.dia === hoje.getDay()) ?? null;
  const hojeIso = hoje.toISOString().slice(0, 10);
  const deHoje = series.filter((s) => s.at.toISOString().slice(0, 10) === hojeIso && s.sessaoId);
  const sessaoId = deHoje[0]?.sessaoId ?? null;
  const itens = doDia ? (doDia.itens as unknown as ItemRotina[]) : [];
  // Exercícios feitos hoje que não estão na rotina também aparecem (ele pode adicionar na hora).
  const extras = [...new Set(deHoje.map((s) => s.exercicio))].filter((e) => !itens.some((i) => i.exercicio === e));
  const lista = [...itens, ...extras.map((e) => ({ exercicio: e, series: 3, repMin: 8, repMax: 12, descanso: 90, segundos: acharExercicio(e)?.tempo ? 30 : null }))];

  const sessao = lista.map((item) => {
    const hist = porEx.get(item.exercicio) ?? [];
    const anteriores = sessoesDo(hist.filter((s) => s.at.toISOString().slice(0, 10) !== hojeIso));
    const feitas = hist.filter((s) => s.at.toISOString().slice(0, 10) === hojeIso && s.sessaoId).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    return {
      ...item,
      grupo: grupoDo(item.exercicio),
      sugestao: sugestao(item, anteriores),
      ultima: anteriores[0] ? { dia: anteriores[0].dia, sets: anteriores[0].sets.map((s) => ({ kg: s.kg, reps: s.reps, segundos: s.segundos })) } : null,
      recorde: melhorRM(hist.filter((s) => s.at.toISOString().slice(0, 10) !== hojeIso)) || null,
      feitas: feitas.map((s) => ({ id: s.id, kg: s.kg, reps: s.reps, segundos: s.segundos, rir: s.rir ?? null })),
    };
  });

  // Estatísticas: dias treinados (91 dias), séries por grupo nos últimos 7, recordes e evolução por exercício.
  const desde91 = new Date(hoje.getTime() - 90 * DIA);
  const ativos = await prisma.corpoLog.findMany({ where: { kind: "academia", at: { gte: desde91 } }, select: { at: true } });
  const dias = [...new Set([...ativos.map((a) => a.at.toISOString().slice(0, 10)), ...series.filter((s) => s.at >= desde91).map((s) => s.at.toISOString().slice(0, 10))])];
  const semana = series.filter((s) => s.at.getTime() > hoje.getTime() - 7 * DIA);
  const seriesGrupo = Object.fromEntries(GRUPOS.filter((g) => g !== "Cardio").map((g) => [g, 0]));
  for (const s of semana) {
    const g = grupoDo(s.exercicio);
    if (g in seriesGrupo) seriesGrupo[g] += s.sessaoId ? 1 : s.series;
  }
  const evolucao = [...porEx.entries()].map(([nome, h]) => {
    const sess = sessoesDo(h).reverse();
    const pontos = sess.map((x) => ({ dia: x.dia, rm: Math.round(melhorRM(x.sets) * 10) / 10, volume: Math.round(x.sets.reduce((t, s) => t + (s.kg ?? 0) * (s.reps ?? 0), 0)) })).filter((p) => p.rm > 0 || p.volume > 0);
    return { nome, grupo: grupoDo(nome), vezes: sess.length, recorde: Math.round(melhorRM(h) * 10) / 10 || null, ultimo: sess.at(-1)?.dia ?? null, pontos: pontos.slice(-20) };
  }).sort((a, b) => (b.ultimo ?? "").localeCompare(a.ultimo ?? ""));

  return {
    hoje: hojeIso,
    biblioteca: [...EXERCICIOS.map((e) => ({ nome: e.nome, grupo: e.grupo, equip: e.equip, tempo: !!e.tempo })), ...proprios.map((p) => ({ nome: p.nome, grupo: p.grupo, equip: p.equipamento, tempo: false }))],
    rotinas: rotinas.map((r) => ({ id: r.id, nome: r.nome, dia: r.dia, itens: r.itens as unknown as ItemRotina[] })),
    rotinaHoje: doDia ? { id: doDia.id, nome: doDia.nome } : null,
    sessaoId,
    // Hora real da 1ª série de hoje (createdAt; "at" guarda só o dia): o cronômetro do treino conta dela.
    inicio: deHoje.length ? new Date(Math.min(...deHoje.map((s) => (s.createdAt ?? s.at).getTime()))).toISOString() : null,
    sessao,
    stats: { dias, seriesGrupo, faixa: SERIES_SEMANA, evolucao },
  };
}

/** Uma série feita (✓ no painel). Devolve se foi recorde. */
export async function registrarSerie(b: { sessaoId?: string | null; exercicio: string; ordem: number; reps?: number | null; kg?: number | null; segundos?: number | null; rir?: number | null }) {
  const hoje = todayBRT();
  const sessaoId = b.sessaoId || `s${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const exercicio = nomeExercicio(b.exercicio);
  const antes = await prisma.treinoSerie.findMany({ where: { exercicio }, select: { kg: true, reps: true } });
  const num = (v: unknown, max: number) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Math.min(max, Math.max(0, Number(v))));
  const kg = num(b.kg, 500), reps = num(b.reps, 100), segundos = num(b.segundos, 3600), rir = num(b.rir, 10);
  const s = await prisma.treinoSerie.create({
    data: { at: hoje, exercicio, series: 1, reps: reps != null ? Math.round(reps) : null, kg, segundos: segundos != null ? Math.round(segundos) : null, rir: rir != null ? Math.round(rir) : null, sessaoId, ordem: b.ordem },
  });
  const rm = kg != null && reps != null ? umRM(kg, reps) : null;
  const recorde = rm != null && antes.length > 0 && rm > melhorRM(antes) + 0.01;
  // Primeira série do dia marca o dia ativo (o mesmo do Corpo).
  const ja = await prisma.corpoLog.findFirst({ where: { kind: "academia", at: { gte: new Date(hoje.getTime() - DIA / 2), lt: new Date(hoje.getTime() + DIA / 2) } } });
  if (!ja) await prisma.corpoLog.create({ data: { kind: "academia", at: hoje, note: "treino guiado" } });
  return { id: s.id, sessaoId, recorde, rm: rm != null ? Math.round(rm * 10) / 10 : null };
}

/** Resumo ao finalizar: séries, volume, recordes e duração. */
export async function resumoSessao(sessaoId: string) {
  const sets = await prisma.treinoSerie.findMany({ where: { sessaoId }, orderBy: { createdAt: "asc" } });
  if (!sets.length) return null;
  const volume = Math.round(sets.reduce((t, s) => t + (s.kg ?? 0) * (s.reps ?? 0), 0));
  const minutos = Math.max(1, Math.round((sets.at(-1)!.createdAt.getTime() - sets[0].createdAt.getTime()) / 60_000));
  const exercicios = [...new Set(sets.map((s) => s.exercicio))];
  const recordes: string[] = [];
  for (const e of exercicios) {
    const hoje = sets.filter((s) => s.exercicio === e);
    const antes = await prisma.treinoSerie.findMany({ where: { exercicio: e, NOT: { sessaoId } }, select: { kg: true, reps: true } });
    if (antes.length && melhorRM(hoje) > melhorRM(antes) + 0.01) recordes.push(e);
  }
  return { series: sets.length, volume, minutos, exercicios: exercicios.length, recordes };
}
