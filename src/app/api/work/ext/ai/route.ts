import { NextResponse } from "next/server";
import { checkWorkToken } from "@/lib/work-auth";
import { runWorkSkill, WORK_SKILLS } from "@/lib/work-ai";

// Botões de IA da extensão (Central do Atendente). Protegido pela chave da
// extensão. O texto não é gravado; no log só vão skill, modelo e tokens.
export async function POST(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const key = String(body?.skill || "");
  try {
    const r = await runWorkSkill(key, String(body?.text || ""), body?.ticketId ? String(body.ticketId) : undefined);
    console.log(`[trabalho] IA ${key}: ${r.model} · ${r.tokens.input}+${r.tokens.output} tokens`);
    return NextResponse.json(r);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[trabalho] IA ${key} falhou:`, msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  return NextResponse.json({ skills: WORK_SKILLS });
}
