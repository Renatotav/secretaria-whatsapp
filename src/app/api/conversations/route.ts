import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");
  const source = searchParams.get("source");

  const conversations = await prisma.conversation.findMany({
    where: {
      ...(phone ? { phone: { contains: phone } } : {}),
      ...(source ? { source } : { source: { in: ["whatsapp", "group"] } }),
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(conversations);
}
