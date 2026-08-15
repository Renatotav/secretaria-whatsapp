import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { parseLocalDate } from "@/lib/dates";
import { projectAndInsertFinanceEntries } from "@/lib/message-handlers";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // formato YYYY-MM
  const year = searchParams.get("year"); // formato YYYY — usado pelos gráficos
  const account = searchParams.get("account");

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

  const dateOrPurchase = searchParams.get("dateOrPurchase") === "true";

  const whereClause: any = dateFilter 
    ? dateOrPurchase
      ? { OR: [{ date: dateFilter }, { purchaseDate: dateFilter }] }
      : { date: dateFilter }
    : {};
  if (account && account !== "all") {
    whereClause.account = { equals: account, mode: "insensitive" };
  }

  const entries = await prisma.financeEntry.findMany({
    where: whereClause,
    orderBy: { date: "asc" },
    include: {
      _count: {
        select: { invoiceItems: true }
      }
    }
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
      category: body.category?.trim() ?? "",
      subcategory: body.subcategory?.trim() ?? "",
      description: body.description?.trim() ?? "",
      date: parseLocalDate(body.date),
      purchaseDate: body.purchaseDate ? parseLocalDate(body.purchaseDate) : null,
      paymentMethod: body.paymentMethod || "pix",
      account: body.account?.trim() || "Principal",
      source: "dashboard",
      status: body.status || "paid",
    },
  });

  // Se o usuário já digitou "Parcela X/Y" na descrição (com ou sem "(compra
  // em DD/MM)"), projeta as parcelas restantes nos meses seguintes — mesma
  // lógica usada na importação de extrato via WhatsApp, sem notificar.
  if (/Parcela \d+\/\d+/.test(entry.description) || /\(recorrente\)/.test(entry.description)) {
    await projectAndInsertFinanceEntries(
      [{
        date: entry.date.toISOString(),
        purchaseDate: entry.purchaseDate?.toISOString(),
        description: entry.description,
        amount: entry.amount,
        type: entry.type as "income" | "expense",
        category: entry.category,
        subcategory: entry.subcategory,
        paymentMethod: entry.paymentMethod,
        account: entry.account,
        status: entry.status as "paid" | "pending",
      }],
      "dashboard"
    );
  }

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
  if (data.date) data.date = parseLocalDate(data.date as string);
  if (data.purchaseDate) data.purchaseDate = parseLocalDate(data.purchaseDate as string);
  if (data.amount !== undefined) data.amount = Number(data.amount);
  if (typeof data.account === "string") data.account = data.account.trim();
  if (typeof data.category === "string") data.category = data.category.trim();
  if (typeof data.subcategory === "string") data.subcategory = data.subcategory.trim();
  if (typeof data.description === "string") data.description = data.description.trim();

  const updated = await prisma.financeEntry.update({ where: { id }, data });

  // Mesma projeção de parcelas restantes, disparada quando a descrição
  // editada passa a ter "Parcela X/Y" (ex: usuário completou o dado à mão).
  if (/Parcela \d+\/\d+/.test(updated.description) || /\(recorrente\)/.test(updated.description)) {
    await projectAndInsertFinanceEntries(
      [{
        date: updated.date.toISOString(),
        purchaseDate: updated.purchaseDate?.toISOString(),
        description: updated.description,
        amount: updated.amount,
        type: updated.type as "income" | "expense",
        category: updated.category,
        subcategory: updated.subcategory,
        account: updated.account,
      }],
      "dashboard"
    );
  }

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
