import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { withErrorHandling } from "@/lib/api-handler";
import { fetchAllContacts } from "@/lib/evolution";

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

  const config = await prisma.agentConfig.findFirst();
  let contactsMap: Record<string, string> = {};
  if (config && config.evolutionUrl && config.evolutionApiKey && config.instanceId) {
    const allContacts = await fetchAllContacts(config.evolutionUrl, config.evolutionApiKey, config.instanceId);
    for (const c of allContacts) {
      const num = c.id.split("@")[0];
      if (c.name || c.pushName) {
        contactsMap[num] = c.name || c.pushName || num;
      }
    }
  }

  const enrichedConversations = conversations.map(c => {
    let displayName = c.phone;
    if (c.source === "group" && c.phone) {
      displayName = groupNameMap[c.phone] || c.phone;
    } else if (c.source === "whatsapp" && c.phone) {
      displayName = contactsMap[c.phone] || c.phone;
    }
    return { ...c, displayName };
  });

  return NextResponse.json(enrichedConversations);
});
