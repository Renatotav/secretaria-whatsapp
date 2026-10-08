import { timingSafeEqual } from "crypto";
import { prisma } from "./prisma";

/**
 * Chave da extensão "Central do Atendente" (Authorization: Bearer <chave>).
 * Gerada no painel (Trabalho › Chave da extensão). Sem chave gerada, recusa.
 */
export async function checkWorkToken(request: Request): Promise<boolean> {
  const config = await prisma.agentConfig.findFirst({ select: { workApiToken: true } });
  const sent = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const expected = config?.workApiToken || "";
  return expected.length >= 32 && sent.length === expected.length && timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
}
