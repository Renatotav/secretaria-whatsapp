import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

// Imagem anexada a um chamado (vinda do celular institucional). Só com login.
export async function GET(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  const a = await prisma.workAttachment.findUnique({ where: { id } });
  if (!a || !a.mimetype.startsWith("image/")) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return new NextResponse(new Uint8Array(a.data), {
    headers: { "Content-Type": a.mimetype, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}

export async function DELETE(request: Request) {
  if (!(await isAuthenticated(request))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await request.json().catch(() => ({}));
  if (typeof id !== "string" || !id) return NextResponse.json({ error: "Informe a imagem" }, { status: 400 });
  await prisma.workAttachment.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}
