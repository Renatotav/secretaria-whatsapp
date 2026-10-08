import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { upsertWorkTicket } from "@/lib/work";

// Entrada da extensão "Central do Atendente" (computador do Tribunal). Não
// usa o login do painel: exige a chave em "Authorization: Bearer <chave>",
// gerada no painel (Trabalho › Chave da extensão). Sem chave gerada, recusa.
// Aceita um chamado ou uma lista: { tickets: [...] }.
export async function POST(request: Request) {
  const config = await prisma.agentConfig.findFirst({ select: { workApiToken: true } });
  const sent = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = config?.workApiToken || "";
  const ok = expected.length >= 32 && sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });

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
