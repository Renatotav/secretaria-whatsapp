import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkWorkToken } from "@/lib/work-auth";
import { normalizeTicketId } from "@/lib/work-privacy";

// Conversa salva do chamado (encaminhada do celular do trabalho), para o
// botão "📱 Usar a conversa salva" do ⚡. Já está com CPF mascarado.
export async function GET(request: Request) {
  if (!(await checkWorkToken(request))) return NextResponse.json({ error: "Chave inválida" }, { status: 401 });
  const id = normalizeTicketId(new URL(request.url).searchParams.get("id") || "");
  if (!/^[A-Z]?\d{6,9}$/.test(id)) return NextResponse.json({ error: "Número de chamado inválido" }, { status: 400 });
  const t = await prisma.workTicket.findUnique({ where: { ticketId: id }, select: { chatLog: true } });
  return NextResponse.json({ chatLog: t?.chatLog || "" });
}
