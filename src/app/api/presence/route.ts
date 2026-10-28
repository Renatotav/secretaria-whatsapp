import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { chegou } from "@/lib/alexa";

// Vigia do celular (servidor, pelo Tailscale): { casa: true | false } a cada
// minuto. Só chega o "sim/não" — os endereços ficam no servidor. Mesma chave
// do vigia da tomada (deviceToken). Chegou (fora → casa): fala o que a Alexa
// guardou enquanto ele estava fora.
async function authorized(request: Request): Promise<boolean> {
  const cfg = await prisma.agentConfig.findFirst({ select: { deviceToken: true } });
  const expected = cfg?.deviceToken || "";
  const sent = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return expected.length >= 32 && sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.casa !== "boolean") return NextResponse.json({ error: "casa deve ser true ou false" }, { status: 400 });
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true, phoneHome: true } });
  if (!cfg) return NextResponse.json({ ok: false });
  await prisma.agentConfig.update({ where: { id: cfg.id }, data: { phoneHome: body.casa, phoneSeenAt: new Date() } });
  // Saiu de casa: marca a hora (o agendador avisa se o ar ficar ligado). Voltou: limpa.
  if (!body.casa && cfg.phoneHome !== false) await prisma.flowState.upsert({ where: { key: "presence:saiu" }, create: { key: "presence:saiu", value: { at: new Date().toISOString() } }, update: { value: { at: new Date().toISOString() } } });
  if (body.casa && cfg.phoneHome === false) await prisma.flowState.deleteMany({ where: { key: "presence:saiu" } });
  let fala = "";
  if (body.casa && cfg.phoneHome === false) {
    fala = await chegou(true).catch(() => "");
  }
  return NextResponse.json({ ok: true, chegou: !!fala });
}
