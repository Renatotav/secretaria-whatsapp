import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWorkToken } from "@/lib/work-auth";

// Última versão da extensão guardada na secretária (a extensão confere a cada 30 min).
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const r = await prisma.extRelease.findFirst({ orderBy: { createdAt: "desc" }, select: { version: true, notes: true, createdAt: true } });
  return NextResponse.json(r ?? { version: null });
}
