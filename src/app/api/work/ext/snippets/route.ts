import { NextResponse } from "next/server";
import { checkWorkToken } from "@/lib/work-auth";
import { getSnippets } from "@/lib/work-snippets";

// A extensão baixa os atalhos (chave da extensão).
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  return NextResponse.json({ snippets: await getSnippets() });
}
