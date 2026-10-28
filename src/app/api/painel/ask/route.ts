import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { generateResponse } from "@/lib/openai";
import { airconData } from "@/lib/aircon";
import { scooterNumbers } from "@/lib/scooter";
import { getProviderOpts } from "@/lib/message-handlers";

// Caixa "Pergunte" das abas Scooter e Ar: a IA (OpenRouter, a mesma da
// secretária) responde só com os números da aba. Nada é gravado.
export const POST = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const aba = body?.aba === "ar" ? "ar" : body?.aba === "scooter" ? "scooter" : null;
  const pergunta = String(body?.pergunta ?? "").trim().slice(0, 300);
  if (!aba || pergunta.length < 3) return NextResponse.json({ error: "Escreva a pergunta." }, { status: 400 });

  const dados =
    aba === "ar"
      ? await airconData()
      : { ...(await scooterNumbers()), registros: (await prisma.scooterLog.findMany({ orderBy: { at: "desc" }, take: 40 })).map((l) => ({ dia: l.at, tipo: l.kind, odo: l.odo, kwh: l.kwh, horas: l.hours, psi: l.psiFront != null ? `${l.psiFront}/${l.psiRear}` : null })) };
  const config = await prisma.agentConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Secretária sem configuração." }, { status: 500 });
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const sistema =
    `Você responde perguntas do Renato sobre a aba "${aba === "ar" ? "Ar-condicionado" : "Scooter"}" do painel dele. ` +
    `Hoje é ${hoje} (horário de Brasília). Use SÓ os dados em JSON abaixo; se não der para saber com eles, diga isso. ` +
    "Português simples, curto (até 4 frases), sem termos técnicos, valores em reais no formato R$ 1.234,56, kWh com vírgula. " +
    "Datas ISO estão em UTC: some -3 h. Não invente números." +
    (aba === "scooter" ? " Casa → trabalho fica a ~2 km (ida e volta ≈ 4 km); safeKm = km que dá para rodar com folga depois da carga, kmSince = km rodados desde ela." : "") +
    "\n\nDADOS:\n" + JSON.stringify(dados).slice(0, 12_000);
  const r = await generateResponse([{ role: "user", content: pergunta }], sistema, 0.2, 400, getProviderOpts(config));
  return NextResponse.json({ resposta: r.content.trim() });
});
