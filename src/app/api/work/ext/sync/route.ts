import { NextResponse } from "next/server";
import { checkWorkToken } from "@/lib/work-auth";
import { escalaSyncStatus, requestEscalaSync } from "@/lib/work-sync";

// Mesmo pedido, pela extensão (chave da extensão).
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  return NextResponse.json(await escalaSyncStatus());
}

export async function POST(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  return NextResponse.json(await requestEscalaSync());
}
