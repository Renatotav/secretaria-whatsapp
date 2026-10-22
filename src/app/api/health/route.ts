import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { healthItems } from "@/lib/health";

export const dynamic = "force-dynamic";

/** 🩺 Saúde do sistema para o painel (mesmos itens do "como está o sistema?"). */
export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const config = await prisma.agentConfig.findFirst();
  if (!config) return NextResponse.json({ itens: [] });
  return NextResponse.json({ itens: await healthItems(config), at: new Date().toISOString() });
});
