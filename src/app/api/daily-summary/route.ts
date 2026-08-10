import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const groupJid = searchParams.get("groupJid");
  const date = searchParams.get("date");

  const summaries = await prisma.dailySummary.findMany({
    where: {
      ...(groupJid ? { groupJid } : {}),
      ...(date ? { date } : {}),
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(summaries);
});
