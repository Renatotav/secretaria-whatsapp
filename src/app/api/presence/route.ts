import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

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
  let fala = "";
  if (body.casa && cfg.phoneHome === false) {
    const { chegou } = await import("@/lib/alexa");
    fala = await chegou(true).catch(() => "");
  }
  return NextResponse.json({ ok: true, chegou: !!fala });
}
