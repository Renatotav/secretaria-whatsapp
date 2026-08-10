import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");

  const entries = await prisma.diaryEntry.findMany({
    where: search ? { content: { contains: search } } : {},
    orderBy: { date: "desc" },
  });

  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const entry = await prisma.diaryEntry.create({
    data: {
      content: body.content ?? "",
      mood: body.mood ?? "",
      date: body.date ? new Date(body.date) : new Date(),
      source: "dashboard",
    },
  });

  return NextResponse.json(entry);
}

export async function PATCH(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const body = await request.json();
  const data: Record<string, unknown> = { ...body };
  if (data.date) data.date = new Date(data.date as string);

  const updated = await prisma.diaryEntry.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.diaryEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
