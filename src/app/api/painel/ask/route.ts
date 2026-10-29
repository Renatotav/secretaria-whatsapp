import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { generateResponse } from "@/lib/openai";
import { airconData } from "@/lib/aircon";
import { scooterNumbers } from "@/lib/scooter";
import { getProviderOpts } from "@/lib/message-handlers";
import { answerFinanceQuestion, type ContaSql } from "@/lib/assistant-chat";

// Caixa "💬 Pergunte" do painel (a IA da secretária, OpenRouter). Três jeitos:
// - com `grafico`: responde SÓ com os números daquele gráfico (vêm da própria tela);
// - aba "finance" sem gráfico: a IA escreve um SELECT, roda só leitura e devolve
//   a consulta e as linhas ("🔍 Ver a conta");
// - abas Scooter e Ar: os números da aba inteira.
// Nada é gravado. Dado do trabalho não passa aqui (tem a caixa própria, com ZDR).
const ABAS: Record<string, string> = { ar: "Ar-condicionado", scooter: "Scooter", finance: "Financeiro", parcelas: "Parcelas" };

export const POST = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const aba = typeof body?.aba === "string" && ABAS[body.aba] ? (body.aba as string) : null;
  const pergunta = String(body?.pergunta ?? "").trim().slice(0, 300);
  if (!aba || pergunta.length < 3) return NextResponse.json({ error: "Escreva a pergunta." }, { status: 400 });
  const grafico = body?.grafico && typeof body.grafico.titulo === "string" ? { titulo: String(body.grafico.titulo).slice(0, 120), dados: body.grafico.dados } : null;

  const config = await prisma.agentConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Secretária sem configuração." }, { status: 500 });
  const opts = getProviderOpts(config);

  if (aba === "finance" && !grafico) {
    let conta: ContaSql | null = null;
    const resposta = await answerFinanceQuestion(pergunta, opts, (c) => (conta = c));
    return NextResponse.json({ resposta: resposta.replace(/^🧠\s*/, ""), conta });
  }

  let dados: unknown;
  if (grafico) dados = grafico.dados;
  else if (aba === "ar") dados = await airconData();
  else if (aba === "scooter")
    dados = { ...(await scooterNumbers()), registros: (await prisma.scooterLog.findMany({ orderBy: { at: "desc" }, take: 40 })).map((l) => ({ dia: l.at, tipo: l.kind, odo: l.odo, kwh: l.kwh, horas: l.hours, psi: l.psiFront != null ? `${l.psiFront}/${l.psiRear}` : null })) };
  else return NextResponse.json({ error: "Escolha um gráfico para perguntar." }, { status: 400 });

  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const onde = grafico ? `o gráfico "${grafico.titulo}" da aba ${ABAS[aba]}` : `a aba "${ABAS[aba]}"`;
  const sistema =
    `Você responde perguntas do Renato sobre ${onde} do painel dele. ` +
    `Hoje é ${hoje} (horário de Brasília). Use SÓ os dados em JSON abaixo; se não der para saber com eles, diga isso. ` +
    "Português simples, curto (até 4 frases), sem termos técnicos, valores em reais no formato R$ 1.234,56, kWh com vírgula. " +
    "Datas ISO estão em UTC: some -3 h. Não invente números. Sem sermão sobre gastos, bebida ou horário." +
    (aba === "scooter" ? " Casa → trabalho fica a ~2 km (ida e volta ≈ 4 km); safeKm = km que dá para rodar com folga depois da carga, kmSince = km rodados desde ela." : "") +
    "\n\nDADOS:\n" + JSON.stringify(dados).slice(0, 12_000);
  const r = await generateResponse([{ role: "user", content: pergunta }], sistema, 0.2, 400, opts);
  return NextResponse.json({ resposta: r.content.trim(), ...(grafico ? { dados: grafico.dados } : {}) });
});
