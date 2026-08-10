import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let config = await prisma.agentConfig.findFirst();
  if (!config) {
    config = await prisma.agentConfig.create({ data: {} });
  }
  return NextResponse.json(config);
});

export const PUT = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  let config = await prisma.agentConfig.findFirst();

  if (!config) {
    config = await prisma.agentConfig.create({ data: body });
  } else {
    config = await prisma.agentConfig.update({
      where: { id: config.id },
      data: body,
    });
  }

  return NextResponse.json(config);
});
