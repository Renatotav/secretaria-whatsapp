import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { escalaSyncStatus, requestEscalaSync } from "@/lib/work-sync";

// Botão "🔄 Atualizar do escala" do painel.
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json(await escalaSyncStatus());
}

export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json(await requestEscalaSync());
}
