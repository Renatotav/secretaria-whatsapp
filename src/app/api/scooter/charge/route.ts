import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// Fim de carga da scooter, enviado pelo programinha do notebook que lê a
// tomada Tapo (Authorization: Bearer <deviceToken>). Só número: kWh, horário
// e potência — nenhum dado da conta TP-Link chega aqui.

async function authorized(request: Request): Promise<boolean> {
  const cfg = await prisma.agentConfig.findFirst({ select: { deviceToken: true } });
  const expected = cfg?.deviceToken || "";
  const sent = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return expected.length >= 32 && sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const kwh = Number(body.kwh);
  const startedAt = body.startedAt ? new Date(body.startedAt) : null;
  const endedAt = body.endedAt ? new Date(body.endedAt) : new Date();
  const maxW = Number(body.maxW) || null;
  const lastW = Number(body.lastW);
  if (!(kwh > 0 && kwh <= 4) || Number.isNaN(endedAt.getTime())) return NextResponse.json({ error: "kWh fora do esperado (0–4)" }, { status: 400 });
  const { recordCharge } = await import("@/lib/scooter");
  const msg = await recordCharge({
    kwh,
    at: endedAt,
    hours: startedAt && !Number.isNaN(startedAt.getTime()) ? (endedAt.getTime() - startedAt.getTime()) / 3_600_000 : null,
    note: `automático (tomada)${maxW ? ` · pico ${Math.round(maxW)} W` : ""}${Number.isFinite(lastW) ? ` · desligou com ${Math.round(lastW)} W` : ""}`,
  });
  // Em casa, a Alexa também avisa (fora do horário de silêncio).
  try {
    const { scooterNumbers } = await import("@/lib/scooter");
    const { alexaFalar } = await import("@/lib/alexa");
    const n = await scooterNumbers();
    const kwhFalado = kwh.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    await alexaFalar(`Renato, a carga da scooter terminou. ${kwhFalado} quilowatts-hora.${n ? ` Dá para rodar uns ${Math.round(n.rangeKm)} quilômetros.` : ""}`);
  } catch (err) {
    console.error("[scooter] aviso na Alexa falhou", err);
  }
  try {
    const { notifyOwner } = await import("@/lib/message-handlers");
    const config = await prisma.agentConfig.findFirst();
    if (config) await notifyOwner(config, msg);
  } catch (err) {
    console.error("[scooter] aviso da carga falhou", err);
  }
  return NextResponse.json({ ok: true });
}
