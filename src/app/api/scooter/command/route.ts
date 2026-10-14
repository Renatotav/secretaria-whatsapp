import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// Comandos para a tomada da scooter ("liga a tomada" no WhatsApp). O vigia
// do servidor (que alcança a tomada pela ponte do Fire TV) busca o comando
// aqui (GET), executa e devolve o resultado (POST). Chave = deviceToken.
async function authorized(request: Request): Promise<boolean> {
  const cfg = await prisma.agentConfig.findFirst({ select: { deviceToken: true } });
  const expected = cfg?.deviceToken || "";
  const sent = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return expected.length >= 32 && sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = await prisma.agentConfig.findFirst({ select: { plugCommand: true } });
  const [cmd, at] = (cfg?.plugCommand || "").split("|");
  // Comando velho (mais de 10 min) não é executado: ele já desistiu de esperar.
  const fresh = cmd && Date.now() - Number(at) < 10 * 60_000;
  return NextResponse.json({ command: fresh ? cmd : null });
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const cfg = await prisma.agentConfig.findFirst();
  if (!cfg) return NextResponse.json({ ok: false });
  await prisma.agentConfig.update({ where: { id: cfg.id }, data: { plugCommand: "" } });
  const w = Number(b.power);
  const estado = b.on ? `ligada${w > 1 ? `, puxando ${Math.round(w)} W${w > 100 ? " (carregando a scooter)" : ""}` : ""}` : "desligada";
  const msg = b.ok
    ? b.command === "status"
      ? `🔌 A tomada está ${estado}.`
      : `🔌 Pronto: tomada ${b.command === "on" ? "ligada" : "desligada"}.${b.command === "on" ? " Quando a carga terminar, o Charge Guard desliga sozinha." : ""}`
    : `⚠️ Não consegui falar com a tomada (${String(b.error || "sem resposta").slice(0, 80)}). O Fire TV está ligado?`;
  const { notifyOwner } = await import("@/lib/message-handlers");
  await notifyOwner(cfg, msg);
  return NextResponse.json({ ok: true });
}
