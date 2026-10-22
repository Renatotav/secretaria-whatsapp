import { NextResponse } from "next/server";
import { checkWorkToken } from "@/lib/work-auth";
import { addUsage } from "@/lib/work-usage";

// A extensão manda 1x por dia quantas vezes usou cada função (só nomes e números).
export async function POST(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const c = body?.contagens;
  if (!c || typeof c !== "object" || Array.isArray(c)) return NextResponse.json({ error: "Envie as contagens" }, { status: 400 });
  await addUsage(Object.fromEntries(Object.entries(c).slice(0, 100)) as Record<string, number>);
  return NextResponse.json({ ok: true });
}
