import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // formato YYYY-MM
  const year = searchParams.get("year"); // formato YYYY — usado pelos gráficos

  let dateFilter: { gte: Date; lte: Date } | undefined;
  if (month) {
    const [y, m] = month.split("-").map(Number);
    dateFilter = {
      gte: new Date(y, m - 1, 1),
      lte: new Date(y, m, 0, 23, 59, 59),
    };
  } else if (year) {
    const y = Number(year);
    dateFilter = {
      gte: new Date(y, 0, 1),
      lte: new Date(y, 11, 31, 23, 59, 59),
    };
  }

  const entries = await prisma.financeEntry.findMany({
    where: dateFilter ? { date: dateFilter } : {},
    orderBy: { date: "desc" },
  });

  return NextResponse.json(entries);
});

export const POST = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const entry = await prisma.financeEntry.create({
    data: {
      type: body.type,
      amount: Number(body.amount) || 0,
      category: body.category ?? "",
      subcategory: body.subcategory ?? "",
      description: body.description ?? "",
      date: body.date ? new Date(body.date) : new Date(),
      source: "dashboard",
    },
  });

  return NextResponse.json(entry);
});

export const PATCH = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const body = await request.json();
  const data: Record<string, unknown> = { ...body };
  if (data.date) data.date = new Date(data.date as string);
  if (data.amount !== undefined) data.amount = Number(data.amount);

  const updated = await prisma.financeEntry.update({ where: { id }, data });
  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const month = searchParams.get("month"); // formato YYYY-MM

  if (searchParams.get("all") === "true") {
    await prisma.financeEntry.deleteMany({});
    return NextResponse.json({ ok: true });
  }

  if (month) {
    const [y, m] = month.split("-").map(Number);
    await prisma.financeEntry.deleteMany({
      where: { date: { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59) } },
    });
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.financeEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
