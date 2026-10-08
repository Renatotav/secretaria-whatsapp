import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWorkToken } from "@/lib/work-auth";

// Teste de conexão da extensão ("Conectado à secretária ✅").
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ ok: false, error: "Chave inválida" }, { status: 401 });
  const total = await prisma.workTicket.count();
  return NextResponse.json({ ok: true, chamados: total });
}
