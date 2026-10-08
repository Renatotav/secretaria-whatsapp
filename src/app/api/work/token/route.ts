import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

// Gera (ou troca) a chave da extensão. A chave antiga para de valer na hora.
export async function POST(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const config = await prisma.agentConfig.findFirst({ select: { id: true } });
  if (!config) return NextResponse.json({ error: "Configuração ausente" }, { status: 500 });
  const token = randomBytes(32).toString("hex");
  await prisma.agentConfig.update({ where: { id: config.id }, data: { workApiToken: token } });
  return NextResponse.json({ token });
}
