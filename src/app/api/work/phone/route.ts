import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

// Vínculo do celular institucional: gera um código de 4 dígitos (vale 15 min)
// que o dono manda do celular do trabalho: "vincular 1234". Ou desvincula.
export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { action } = await request.json().catch(() => ({}));
  const config = await prisma.agentConfig.findFirst({ select: { id: true } });
  if (!config) return NextResponse.json({ error: "Configuração ausente" }, { status: 500 });
  if (action === "unlink") {
    await prisma.agentConfig.update({ where: { id: config.id }, data: { workPhone: "", workPairCode: "" } });
    return NextResponse.json({ ok: true });
  }
  const code = String(randomInt(1000, 10000));
  await prisma.agentConfig.update({ where: { id: config.id }, data: { workPairCode: `${code}|${Date.now() + 15 * 60_000}` } });
  return NextResponse.json({ code });
}
