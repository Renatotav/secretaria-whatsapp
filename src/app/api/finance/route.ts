import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { parseLocalDate, autoEntryDates, todayBRT } from "@/lib/dates";
import { projectAndInsertFinanceEntries } from "@/lib/message-handlers";
import { autoMarkPaid } from "@/lib/auto-pay";

/** Faz parte de uma série: parcela, mês previsto/recorrente, ou assinatura. */
function isSeriesEntry(e: { description: string; category: string }): boolean {
  return /Parcela \d+\/\d+/.test(e.description) || /\((previsto|recorrente)\)/i.test(e.description) || e.category === "Assinaturas";
}

/** Descrição sem número de parcela, "(compra em ...)" e "(previsto)" — igual entre itens da mesma série. */
function seriesKey(e: { description: string }): string {
  return e.description
    .replace(/\s*-?\s*Parcela \d+\/\d+/gi, "")
    .replace(/\s*\(compra em [^)]*\)/gi, "")
    .replace(/\s*\((previsto|recorrente)\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const GET = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Verifica e atualiza lançamentos pendentes que já venceram
  await autoMarkPaid();

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
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  // Data da fatura e pago/pendente saem sozinhos (cartão = vencimento da
  // fatura, "pendente"; pix/débito/etc. = "pago" se já passou). O status
  // escolhido à mão só vale se o dono mexeu nele (statusManual).
  const config = await prisma.agentConfig.findFirst({ select: { creditCardDueDay: true, creditCardBestDay: true } });
  const auto = autoEntryDates(
    { type: body.type, paymentMethod: body.paymentMethod || "pix", date: body.date, purchaseDate: body.purchaseDate, description: body.description },
    config?.creditCardDueDay || 10,
    config?.creditCardBestDay || 5
  );
  const entry = await prisma.financeEntry.create({
    data: {
      type: body.type,
      amount: Number(body.amount) || 0,
      category: body.category?.trim() ?? "",
      subcategory: body.subcategory?.trim() ?? "",
      description: body.description?.trim() ?? "",
      date: auto.date,
      purchaseDate: auto.purchaseDate,
      paymentMethod: body.paymentMethod || "pix",
      account: body.account?.trim() || "Principal",
      source: "dashboard",
      status: body.statusManual && body.status ? body.status : auto.status,
      mood: body.mood || "neutro",
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
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const body = await request.json();
  const { statusManual, ...rest } = body as Record<string, unknown>;
  const data: Record<string, unknown> = { ...rest };
  const beforeAuto = await prisma.financeEntry.findUnique({ where: { id } });

  // Mudou a forma de pagamento ou a data da compra? Recalcula a fatura (se for
  // cartão) e o pago/pendente. Mudar só a data da fatura à mão é respeitado
  // (ex: fatura que fechou antes por feriado).
  if (beforeAuto) {
    const day = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : v instanceof Date ? v.toISOString().slice(0, 10) : "");
    const method = (data.paymentMethod as string) ?? beforeAuto.paymentMethod;
    const purchase = data.purchaseDate !== undefined ? (data.purchaseDate as string | null) : beforeAuto.purchaseDate?.toISOString() ?? null;
    const methodChanged = data.paymentMethod !== undefined && data.paymentMethod !== beforeAuto.paymentMethod;
    const purchaseChanged = data.purchaseDate !== undefined && day(data.purchaseDate) !== day(beforeAuto.purchaseDate);
    const dateChanged = data.date !== undefined && day(data.date) !== day(beforeAuto.date);
    if (methodChanged || purchaseChanged || dateChanged) {
      const config = await prisma.agentConfig.findFirst({ select: { creditCardDueDay: true, creditCardBestDay: true } });
      const type = (data.type as string) ?? beforeAuto.type;
      const isCard = type === "expense" && method === "cartão";
      const auto = autoEntryDates(
        {
          type,
          paymentMethod: method,
          // Cartão com só a data da fatura mudada: mantém a fatura escolhida.
          date: isCard && !methodChanged && !purchaseChanged ? null : ((data.date as string) ?? beforeAuto.date.toISOString()),
          purchaseDate: purchase,
          description: (data.description as string) ?? beforeAuto.description,
        },
        config?.creditCardDueDay || 10,
        config?.creditCardBestDay || 5
      );
      if (isCard && !methodChanged && !purchaseChanged) {
        // Fatura escolhida à mão: pendente até ela vencer.
        if (!statusManual) data.status = parseLocalDate(data.date as string).getTime() >= todayBRT().getTime() ? "pending" : "paid";
      } else {
        data.date = auto.date.toISOString();
        if (auto.purchaseDate) data.purchaseDate = auto.purchaseDate.toISOString();
        if (!statusManual) data.status = auto.status;
      }
    }
  }
  if (data.date) data.date = parseLocalDate(data.date as string);
  if (data.purchaseDate) data.purchaseDate = parseLocalDate(data.purchaseDate as string);
  if (data.amount !== undefined) data.amount = Number(data.amount);
  if (typeof data.account === "string") data.account = data.account.trim();
  if (typeof data.category === "string") data.category = data.category.trim();
  if (typeof data.subcategory === "string") data.subcategory = data.subcategory.trim();
  if (typeof data.description === "string") data.description = data.description.trim();

  const before = await prisma.financeEntry.findUnique({ where: { id } });
  const updated = await prisma.financeEntry.update({ where: { id }, data });

  // Trocou o meio de pagamento / conta de um item de SÉRIE (parcelas da mesma
  // compra, ou meses previstos do mesmo aluguel/salário/assinatura)? Leva a
  // troca pros outros itens da mesma série. Compra avulsa (mercado, almoço,
  // Uber...) nunca arrasta outras — antes isso pegava a categoria inteira.
  const updateData: { paymentMethod?: string; account?: string } = {};
  if (before && data.paymentMethod && data.paymentMethod !== before.paymentMethod) updateData.paymentMethod = data.paymentMethod as string;
  if (before && data.account && data.account !== before.account) updateData.account = data.account as string;

  if (Object.keys(updateData).length > 0 && isSeriesEntry(updated)) {
    const key = seriesKey(updated);
    const siblings = await prisma.financeEntry.findMany({
      where: {
        id: { not: updated.id },
        type: updated.type,
        category: updated.category,
        subcategory: updated.subcategory,
        amount: { gte: updated.amount - 0.01, lte: updated.amount + 0.01 },
      },
      select: { id: true, description: true, category: true },
    });
    const sameSeries = siblings.filter((s) => isSeriesEntry(s) && seriesKey(s) === key).map((s) => s.id);
    if (sameSeries.length > 0) {
      await prisma.financeEntry.updateMany({ where: { id: { in: sameSeries } }, data: updateData });
    }
  }

  return NextResponse.json(updated);
});

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!(await isAuthenticated(request))) {
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
