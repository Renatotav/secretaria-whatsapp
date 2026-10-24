import { NextResponse } from "next/server";
import { checkWorkToken } from "@/lib/work-auth";
import { missingFromSheet } from "@/lib/work";

// Extensão (⚡ › "📋 Faltando na planilha"): chamados que ele fechou na Central
// e que ainda não têm linha na planilha, com o necessário para montar a linha.
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  return NextResponse.json({ tickets: await missingFromSheet() });
}
