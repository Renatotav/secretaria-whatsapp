import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { limpaItens, registrarSerie, resumoSessao, treinoAba } from "@/lib/treino-guiado";
import { GRUPOS } from "@/lib/exercicios";

export const dynamic = "force-dynamic";

/** Aba Treino: tudo de uma vez (rotina de hoje com sugestões, rotinas, biblioteca, estatísticas). */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json(await treinoAba(new URL(request.url).searchParams.get("rotina")));
});

/** Ações: serie | apagarSerie | finalizar | salvarRotina | apagarRotina | criarExercicio. */
export const POST = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  switch (b.acao) {
    case "serie":
      if (typeof b.exercicio !== "string") return NextResponse.json({ error: "Falta o exercício." }, { status: 400 });
      return NextResponse.json(await registrarSerie({ sessaoId: b.sessaoId as string | null, exercicio: b.exercicio, ordem: Number(b.ordem) || 1, reps: b.reps as number, kg: b.kg as number, segundos: b.segundos as number, rir: b.rir as number }));
    case "apagarSerie":
      await prisma.treinoSerie.deleteMany({ where: { id: String(b.id), sessaoId: { not: null } } });
      return NextResponse.json({ ok: true });
    case "finalizar":
      return NextResponse.json({ resumo: await resumoSessao(String(b.sessaoId)) });
    case "salvarRotina": {
      const nome = String(b.nome ?? "").trim().slice(0, 60);
      const itens = limpaItens(b.itens);
      const dia = b.dia === null || b.dia === "" || b.dia === undefined ? null : Math.min(6, Math.max(0, Number(b.dia)));
      if (!nome || !itens.length) return NextResponse.json({ error: "Dê um nome e coloque pelo menos um exercício." }, { status: 400 });
      const data = { nome, dia, itens: itens as unknown as object };
      const r = b.id ? await prisma.rotina.update({ where: { id: String(b.id) }, data }) : await prisma.rotina.create({ data });
      return NextResponse.json({ id: r.id });
    }
    case "apagarRotina":
      await prisma.rotina.update({ where: { id: String(b.id) }, data: { ativa: false } });
      return NextResponse.json({ ok: true });
    case "criarExercicio": {
      const nome = String(b.nome ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
      const grupo = GRUPOS.includes(b.grupo as never) ? String(b.grupo) : "";
      if (nome.length < 3 || !grupo) return NextResponse.json({ error: "Escreva o nome e escolha o grupo muscular." }, { status: 400 });
      await prisma.exercicioProprio.upsert({ where: { nome }, create: { nome, grupo, equipamento: String(b.equipamento ?? "") }, update: { grupo } });
      return NextResponse.json({ ok: true });
    }
  }
  return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
});
