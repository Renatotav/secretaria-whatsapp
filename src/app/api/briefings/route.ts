import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const read = searchParams.get("read");
  const urgency = searchParams.get("urgency");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const briefings = await prisma.briefing.findMany({
    where: {
      ...(read !== null ? { read: read === "true" } : {}),
      ...(urgency ? { urgency } : {}),
      ...(from || to
        ? {
            receivedAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: { receivedAt: "desc" },
  });

  return NextResponse.json(briefings);
});

export const PATCH = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const body = await request.json();
  const updated = await prisma.briefing.update({ where: { id }, data: body });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.briefing.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
