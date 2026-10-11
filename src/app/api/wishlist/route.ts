import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWish } from "@/lib/message-handlers";

// Lista de desejos: itens com o veredito "cabe agora?" (mesma conta do
// "posso comprar?" do WhatsApp).
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const wishes = await prisma.wishItem.findMany({ orderBy: [{ status: "desc" }, { createdAt: "asc" }] });
    const withVerdict = [];
    for (const w of wishes) {
      withVerdict.push({ ...w, verdict: w.status === "wish" ? await checkWish(w) : null });
    }
    return NextResponse.json(withVerdict);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const amount = Number(body.amount);
    if (!name || !(amount > 0)) return NextResponse.json({ error: "Nome e valor obrigatórios" }, { status: 400 });
    const paymentMethod = ["cartão", "pix", "débito", "dinheiro", "ticket"].includes(body.paymentMethod) ? body.paymentMethod : "cartão";
    const wish = await prisma.wishItem.create({
      data: {
        name,
        amount,
        installments: paymentMethod === "cartão" ? Math.max(1, Math.round(Number(body.installments) || 1)) : 1,
        paymentMethod,
        category: typeof body.category === "string" && body.category ? body.category : "Compras",
      },
    });
    return NextResponse.json(wish);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Comprei / desisti / voltar para a lista.
export async function PATCH(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id, status } = await req.json();
    if (!id || !["wish", "bought", "dropped"].includes(status)) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    return NextResponse.json(await prisma.wishItem.update({ where: { id }, data: { status } }));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAuthenticated(req))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id } = await req.json();
    await prisma.wishItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
