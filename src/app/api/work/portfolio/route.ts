import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

// Painel "Minha produtividade" (portfólio): só números agregados — nenhum
// nome, CPF, descrição ou número de chamado sai daqui.

const DAY = 86400_000;
const brt = (d: Date) => new Date(d.getTime() - 3 * 3600_000);
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Nome das equipes do escala como ele chama no dia a dia (APOF/APC são as siglas).
function teamName(raw: string) {
  const t = raw.replace(/^3N\s+SUPJUD\s+/i, "").trim();
  if (/apof/i.test(t)) return "Erro e Falha";
  if (/\bapc\b/i.test(t)) return "Cadastro";
  if (/redmine/i.test(t)) return "Redmines";
  return t;
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const closed = await prisma.workTicket.findMany({
    where: { status: { in: ["resolvido", "escalado"] }, resolvedAt: { not: null } },
    select: { status: true, redmine: true, openedAt: true, receivedAt: true, resolvedAt: true, errorGroup: true, origin: true, tmrHours: true, team: true },
  });
  const openCount = await prisma.workTicket.count({ where: { status: { in: ["aberto", "pendente"] } } });

  // Tempo com ele: TMR exclusivo do escala (horas) quando houver; senão, do
  // recebimento ao fechamento. Fechamento igual ao recebimento = planilha sem
  // data de resolução (não entra na conta).
  const spanDays = (t: (typeof closed)[number]) => {
    if (t.tmrHours !== null && t.tmrHours !== undefined) return t.tmrHours / 24;
    const start = t.receivedAt ?? t.openedAt;
    return start && t.resolvedAt! > start && t.resolvedAt!.getTime() !== (t.receivedAt?.getTime() ?? -1) ? (t.resolvedAt!.getTime() - start.getTime()) / DAY : null;
  };
  const withRedmine = (t: (typeof closed)[number]) => t.status === "escalado" || !!t.redmine;

  // Por mês: fechados (direto × com Redmine) e tempo médio.
  const byMonth = new Map<string, { label: string; direto: number; redmine: number; spans: number[] }>();
  for (const t of closed) {
    const d = brt(t.resolvedAt!);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const m = byMonth.get(key) ?? { label: `${MONTHS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, direto: 0, redmine: 0, spans: [] };
    withRedmine(t) ? m.redmine++ : m.direto++;
    const s = spanDays(t);
    if (s !== null && (t.tmrHours !== null && t.tmrHours !== undefined || !closed.some((x) => x.tmrHours !== null && x.tmrHours !== undefined))) m.spans.push(s);
    byMonth.set(key, m);
  }
  const meses = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([, m]) => ({ mes: m.label, direto: m.direto, redmine: m.redmine, tempoMedio: m.spans.length ? m.spans.reduce((a, b) => a + b, 0) / m.spans.length : null }));

  // Dia da semana × hora do fechamento (mapa de calor).
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const t of closed) {
    const d = brt(t.resolvedAt!);
    heat[d.getUTCDay()][d.getUTCHours()]++;
  }

  const tally = (key: (t: (typeof closed)[number]) => string) =>
    Object.entries(closed.reduce<Record<string, number>>((acc, t) => ((acc[key(t)] = (acc[key(t)] || 0) + 1), acc), {}))
      .sort((a, b) => b[1] - a[1])
      .map(([nome, n]) => ({ nome, n }));

  // Uma métrica só: se a maioria tem o TMR exclusivo do escala, a média usa só
  // esses (misturar com "abertura → fechamento" infla o número).
  const hasTmr = (t: (typeof closed)[number]) => t.tmrHours !== null && t.tmrHours !== undefined;
  const fromTmr = closed.filter(hasTmr).length;
  const useTmrOnly = fromTmr > 0 && fromTmr >= closed.length / 2;
  const spans = closed
    .filter((t) => !useTmrOnly || hasTmr(t))
    .map(spanDays)
    .filter((x): x is number => x !== null);
  const first = closed.reduce<Date | null>((m, t) => (!m || t.resolvedAt! < m ? t.resolvedAt! : m), null);
  const weeks = first ? Math.max(1, (Date.now() - first.getTime()) / (7 * DAY)) : 1;

  return NextResponse.json({
    geradoEm: new Date().toISOString(),
    desde: first ? brt(first).toISOString().slice(0, 10) : null,
    kpis: {
      fechados: closed.length,
      porSemana: Math.round((closed.length / weeks) * 10) / 10,
      tempoMedioDias: spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : null,
      tempoMedianoDias: median(spans),
      ateUmDiaPct: spans.length ? Math.round((spans.filter((d) => d <= 1).length / spans.length) * 100) : null,
      tempoFonte: useTmrOnly ? "tmr" : "datas",
      tempoBase: spans.length,
      semRedminePct: closed.length ? Math.round((closed.filter((t) => !withRedmine(t)).length / closed.length) * 100) : null,
      emAberto: openCount,
    },
    meses,
    heat,
    // "sem informação" sai das barras e vira só uma nota.
    grupos: tally((t) => (t.errorGroup && t.errorGroup !== "Sem grupo" ? t.errorGroup : "")).filter((x) => x.nome),
    gruposSem: closed.filter((t) => !t.errorGroup || t.errorGroup === "Sem grupo").length,
    origem: tally((t) => (t.origin === "externo" ? "Usuário externo" : t.origin === "interno" ? "Usuário interno" : "")).filter((x) => x.nome),
    origemSem: closed.filter((t) => t.origin !== "externo" && t.origin !== "interno").length,
    equipes: tally((t) => teamName(t.team)).filter((x) => x.nome),
  });
}
