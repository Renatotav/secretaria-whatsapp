import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// Aviso do vigia da tomada (servidor): a ponte até a tomada de casa caiu ou
// voltou. Mesma chave do fim de carga (deviceToken). Só manda o aviso.
async function authorized(request: Request): Promise<boolean> {
  const cfg = await prisma.agentConfig.findFirst({ select: { deviceToken: true } });
  const expected = cfg?.deviceToken || "";
  const sent = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return expected.length >= 32 && sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const minutos = Math.max(0, Math.round(Number(body.minutes) || 0));
  let msg = "";
  if (body.state === "down") {
    msg = `⚠️ A ponte da tomada da scooter caiu há ${minutos} min — não consigo ler a tomada. O Fire TV está ligado e no Wi-Fi? (Se a tomada mudou de IP, me avise.)`;
  } else if (body.state === "up") {
    msg = `✅ A ponte da tomada voltou${minutos ? ` (ficou ${minutos} min fora)` : ""}. Já estou vigiando as cargas de novo.`;
  } else return NextResponse.json({ error: "state deve ser down ou up" }, { status: 400 });
  const { notifyOwner } = await import("@/lib/message-handlers");
  const config = await prisma.agentConfig.findFirst();
  if (config) await notifyOwner(config, msg);
  return NextResponse.json({ ok: true });
}
