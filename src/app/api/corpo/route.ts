import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { corpoPainel } from "@/lib/corpo";

/** Dados da aba Corpo: pesos, meta, academia e besteira/delivery por semana. */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  return NextResponse.json(await corpoPainel());
});
