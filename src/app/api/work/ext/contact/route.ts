import { NextResponse } from "next/server";
import { checkWorkToken } from "@/lib/work-auth";
import { getContact, saveContact } from "@/lib/work-crm";
import { getSituations } from "@/lib/work-situations";
import { listContactTags } from "@/lib/work-crm";

// CRM do WhatsApp Web (extensão, chave da extensão).
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const url = new URL(request.url);
  // ?all=1: resumo de todos os contatos (etiquetas, chamados, lembrete) para
  // a extensão marcar a lista de conversas do WhatsApp Web. Sem as notas.
  if (url.searchParams.get("all")) {
    return NextResponse.json({ contacts: await listContactTags() });
  }
  const key = url.searchParams.get("key") || "";
  const r = await getContact(key);
  if (!r) return NextResponse.json({ error: "Conversa sem nome" }, { status: 400 });
  return NextResponse.json({ ...r, situations: await getSituations() });
}

export async function PUT(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  try {
    const body = await request.json();
    await saveContact(body);
    const r = await getContact(body.key);
    return NextResponse.json({ ...r, situations: await getSituations() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
