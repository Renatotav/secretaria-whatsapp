import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSituations, saveSituations } from "@/lib/work-situations";

// Lista de situações dos chamados (editor do painel).
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({ situations: await getSituations() });
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.situations)) return NextResponse.json({ error: "Envie a lista" }, { status: 400 });
  return NextResponse.json({ situations: await saveSituations(body.situations) });
}
