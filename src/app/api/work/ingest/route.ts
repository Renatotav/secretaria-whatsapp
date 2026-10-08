import { NextResponse } from "next/server";
import { upsertWorkTicket } from "@/lib/work";
import { checkWorkToken } from "@/lib/work-auth";

// Entrada da extensão "Central do Atendente" (computador do Tribunal). Não
// usa o login do painel: exige a chave em "Authorization: Bearer <chave>",
// gerada no painel (Trabalho › Chave da extensão). Sem chave gerada, recusa.
// Aceita um chamado ou uma lista: { tickets: [...] }.
export async function POST(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const list = Array.isArray(body?.tickets) ? body.tickets : body ? [body] : [];
  let saved = 0;
  const errors: string[] = [];
  for (const t of list.slice(0, 500)) {
    try {
      await upsertWorkTicket(t, "extensao");
      saved++;
    } catch (err) {
      errors.push(`${t?.ticketId ?? "?"}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return NextResponse.json({ saved, errors });
}
