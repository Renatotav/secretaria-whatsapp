import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getSnippets, saveSnippets } from "@/lib/work-snippets";

// Editor de atalhos do painel.
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({ snippets: await getSnippets() });
}

export async function PUT(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.snippets)) return NextResponse.json({ error: "Envie a lista" }, { status: 400 });
  return NextResponse.json({ snippets: await saveSnippets(body.snippets) });
}
