import { NextResponse } from "next/server";
import { isAuthenticated, isAuthenticatedOuPersonal } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { applyCorpoCommand, corpoPainel } from "@/lib/corpo";

/** Dados da aba Corpo: pesos, meta, academia e besteira/delivery por semana. */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticatedOuPersonal(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return NextResponse.json(await corpoPainel());
});

/** Registrar o peso pelo painel (só o dono): o mesmo caminho do "peso 108,5" no WhatsApp. */
export const POST = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const kg = Number((await request.json().catch(() => ({})))?.peso);
  if (!(kg >= 30 && kg <= 300)) return NextResponse.json({ error: "Peso fora do normal." }, { status: 400 });
  const resposta = await applyCorpoCommand(`peso ${String(Math.round(kg * 10) / 10).replace(".", ",")}`);
  return NextResponse.json({ resposta });
});
