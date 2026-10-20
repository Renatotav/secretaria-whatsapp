import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWorkToken } from "@/lib/work-auth";

// Última versão da extensão guardada na secretária (a extensão confere a cada 2 min).
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const r = await prisma.extRelease.findFirst({ orderBy: { createdAt: "desc" }, select: { version: true, notes: true, createdAt: true } });
  // pedido = quando ele mandou "atualiza a extensão" no WhatsApp (a extensão se atualiza na hora).
  const cfg = await prisma.agentConfig.findFirst({ select: { extUpdateAt: true } });
  return NextResponse.json({ ...(r ?? { version: null }), pedido: cfg?.extUpdateAt ?? null });
}
