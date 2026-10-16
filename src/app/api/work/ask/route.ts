import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { planFor, rowsFor, describe, answerWorkQuestion } from "@/lib/work-ask";
import { alertsFor } from "@/lib/work-sla";

// "💬 Pergunte aos seus chamados" no painel. A IA só traduz a pergunta em
// filtros; a conta é feita no banco. Devolve a resposta, o critério usado
// (de onde veio o número) e os chamados, para clicar.
export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { pergunta } = await request.json().catch(() => ({}));
  const q = String(pergunta || "").trim().slice(0, 500);
  if (!q) return NextResponse.json({ error: "Escreva a pergunta." }, { status: 400 });
  const p = await planFor(q);
  if (!p || !p.entendi) return NextResponse.json({ resposta: "Não entendi como pergunta sobre os seus chamados. Ex.: \"quantos de MNI eu fechei este mês?\"", chamados: [] });
  const [resposta, rows] = await Promise.all([answerWorkQuestion(q, p), rowsFor(p)]);
  return NextResponse.json({
    resposta: (resposta || "").replace(/^💼\s*/, "").replace(/\*/g, ""),
    criterio: describe(p),
    chamados: rows.slice(0, 40).map((t) => ({ ticketId: t.ticketId, status: t.status, tipo: t.errorType, grupo: t.errorGroup, dias: alertsFor(t).days })),
  });
}
