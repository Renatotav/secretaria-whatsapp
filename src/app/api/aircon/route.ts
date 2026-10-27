import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { airconData } from "@/lib/aircon";

/** Dados da aba Ar-condicionado (só leitura do SmartThings). */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json(await airconData());
});
