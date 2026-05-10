import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateResponse } from "@/lib/openai";
import { isAuthenticated } from "@/lib/auth";

export async function GET(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const conversations = await prisma.conversation.findMany({
    where: { source: "chat" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(conversations);
}

export async function POST(request: Request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { conversationId, message } = await request.json();
  const config = await prisma.agentConfig.findFirst();
  if (!config) return NextResponse.json({ error: "Sem configuração" }, { status: 500 });

  let conversation = conversationId
    ? await prisma.conversation.findUnique({ where: { id: conversationId }, include: { messages: true } })
    : null;

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { source: "chat" },
      include: { messages: true },
    });
  }

  await prisma.message.create({
    data: { conversationId: conversation.id, role: "user", content: message },
  });

  const history = conversation.messages
    .slice(-config.historyLimit)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  history.push({ role: "user", content: message });

  const { content, tokens } = await generateResponse(
    history,
    config.systemPrompt,
    config.temperature,
    config.maxTokens,
    {
      aiProvider: config.aiProvider,
      openaiApiKey: config.openaiApiKey,
      openaiModel: config.openaiModel,
      groqApiKey: config.groqApiKey,
      groqModel: config.groqModel,
    }
  );

  const saved = await prisma.message.create({
    data: { conversationId: conversation.id, role: "assistant", content, tokens },
  });

  return NextResponse.json({ conversationId: conversation.id, message: saved });
}
