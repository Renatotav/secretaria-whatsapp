import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

// Lista de contatos do CRM (painel).
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const contacts = await prisma.workContact.findMany({ orderBy: { updatedAt: "desc" }, take: 300 });
  return NextResponse.json({ contacts });
}

export async function DELETE(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Informe o contato" }, { status: 400 });
  await prisma.workContact.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
