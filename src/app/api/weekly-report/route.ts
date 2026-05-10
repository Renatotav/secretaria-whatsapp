import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart");

  if (weekStart) {
    const report = await prisma.weeklyReport.findFirst({ where: { weekStart } });
    return NextResponse.json(report);
  }

  const reports = await prisma.weeklyReport.findMany({
    orderBy: { weekStart: "desc" },
    take: 10,
  });
  return NextResponse.json(reports);
}
