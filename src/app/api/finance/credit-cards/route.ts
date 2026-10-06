import { NextResponse } from "next/server";
import { listOpenInvoices, payInvoice } from "@/lib/invoices";

// Faturas em aberto, uma por cartão e vencimento.
export async function GET() {
  try {
    return NextResponse.json(await listOpenInvoices());
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// "Marcar como paga": dá baixa em todas as compras da fatura de uma vez.
export async function POST(req: Request) {
  try {
    const { card, dueDate } = await req.json();
    if (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return NextResponse.json({ error: "dueDate inválido" }, { status: 400 });
    }
    const { ids, total } = await payInvoice(typeof card === "string" ? card : "", dueDate);
    return NextResponse.json({ count: ids.length, total });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
