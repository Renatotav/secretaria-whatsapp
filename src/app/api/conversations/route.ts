import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";

export const GET = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");
  const source = searchParams.get("source");

  const conversations = await prisma.conversation.findMany({
    where: {
      ...(phone ? { phone: { contains: phone } } : {}),
      ...(source ? { source } : { source: { in: ["whatsapp", "group", "self"] } }),
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const groupJids = conversations.filter(c => c.source === "group" && c.phone).map(c => c.phone as string);
  const groupConfigs = await prisma.groupConfig.findMany({
    where: { groupJid: { in: groupJids } },
    select: { groupJid: true, groupName: true }
  });
  const groupNameMap = Object.fromEntries(groupConfigs.map(g => [g.groupJid, g.groupName]));

  const enrichedConversations = conversations.map(c => ({
    ...c,
    displayName: c.source === "group" && c.phone ? (groupNameMap[c.phone] || c.phone) : c.phone,
  }));

  return NextResponse.json(enrichedConversations);
});

export const DELETE = withErrorHandling(async (request: Request) => {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all");
  const source = searchParams.get("source");

  if (all === "true") {
    if (source) {
      const convs = await prisma.conversation.findMany({ where: { source }, select: { id: true } });
      const ids = convs.map((c) => c.id);
      await prisma.message.deleteMany({ where: { conversationId: { in: ids } } });
      await prisma.conversation.deleteMany({ where: { source } });
    } else {
      await prisma.message.deleteMany({});
      await prisma.conversation.deleteMany({});
    }
    return NextResponse.json({ ok: true });
  }

  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  await prisma.conversation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});

