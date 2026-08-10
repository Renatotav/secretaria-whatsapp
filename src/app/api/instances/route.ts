import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { fetchInstances } from "@/lib/evolution";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const config = await prisma.agentConfig.findFirst();
    if (!config || !config.evolutionUrl || !config.evolutionApiKey) {
      return NextResponse.json({ error: "Configure a Evolution API primeiro" }, { status: 400 });
    }

    const instances = await fetchInstances(config.evolutionUrl, config.evolutionApiKey);
    return NextResponse.json({ instances, activeInstanceId: config.instanceId });
  } catch (err) {
    console.error("[api/instances]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao buscar instâncias" },
      { status: 502 }
    );
  }
}
