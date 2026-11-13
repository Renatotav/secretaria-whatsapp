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
    // Print da tela (data URL) só para o Manual do plantão; até ~6 MB.
    const m = typeof body?.imagem === "string" ? body.imagem.match(/^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/) : null;
    const imagem = m && m[1].length < 8_000_000 ? Buffer.from(m[1], "base64") : undefined;
    const r = await runWorkSkill(key, String(body?.text || ""), body?.ticketId ? String(body.ticketId) : undefined, body?.plain === true, undefined, key === "manual" ? imagem : undefined);
    // Conta qual botão de IA foi usado (só o nome da skill).
    import("@/lib/work-usage").then(({ addUsage }) => addUsage({ [`ia:${key}${r.skill !== key ? `→${r.skill}` : ""}`]: 1 })).catch(() => {});
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
