import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { insight, type Recorte } from "@/lib/work-insight";

// Clique numa barra da Produtividade: resumo do recorte no mês (só banco).
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const url = new URL(request.url);
  const recorte = url.searchParams.get("recorte") as Recorte;
  const valor = (url.searchParams.get("valor") || "").slice(0, 200);
  if (!["grupo", "tipo", "origem"].includes(recorte) || !valor) return NextResponse.json({ error: "Recorte inválido" }, { status: 400 });
  return NextResponse.json(await insight(recorte, valor));
}
