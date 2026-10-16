import OpenAI from "openai";
import { prisma } from "./prisma";

// Base de conhecimento: chamado resolvido com a resolução escrita vira um
// artigo curto (Problema · Causa · Solução). Poucos por minuto, no agendador.
// O texto já está mascarado no banco (CPF/telefone/e-mail não existem aqui).

const PROMPT =
  "Você escreve artigos curtos da base de conhecimento do suporte do PJe (TJCE), a partir de um chamado resolvido. " +
  "Responda só com três linhas, em português, sem markdown:\n" +
  "Problema: <o que o usuário enfrentou, em 1 frase>\nCausa: <a causa identificada; se o texto não disser, escreva 'não informada'>\nSolução: <o que resolveu ou o encaminhamento, em até 2 frases>\n" +
  "Não invente nada que não esteja no texto. Não cite nomes de pessoas, CPF, telefone ou e-mail. Mantenha números de processo, nomes de sistemas, tarefas e telas como estão.";

export async function writePendingKb(limit = 2): Promise<number> {
  const cfg = await prisma.agentConfig.findFirst({ select: { openrouterApiKey: true, workAiModel: true } });
  if (!cfg?.openrouterApiKey) return 0;
  const rows = await prisma.workTicket.findMany({
    where: { kbArticle: "", status: { in: ["resolvido", "escalado"] }, resolution: { not: "" } },
    select: { ticketId: true, errorType: true, errorGroup: true, description: true, resolution: true },
    orderBy: { resolvedAt: "desc" },
    take: limit,
  });
  if (!rows.length) return 0;
  const client = new OpenAI({ apiKey: cfg.openrouterApiKey, baseURL: "https://openrouter.ai/api/v1" });
  let n = 0;
  for (const t of rows) {
    const texto = [`Tipo: ${t.errorType}`, t.errorGroup && `Grupo: ${t.errorGroup}`, t.description && `Descrição: ${t.description.slice(0, 3000)}`, `Resolução: ${t.resolution.slice(0, 3000)}`].filter(Boolean).join("\n");
    try {
      const r = await client.chat.completions.create({
        model: cfg.workAiModel || "anthropic/claude-sonnet-5.5",
        temperature: 0,
        max_tokens: 2500,
        ...({ reasoning: { max_tokens: 1024 } } as object),
        messages: [{ role: "system", content: PROMPT }, { role: "user", content: texto }],
      });
      const art = (r.choices[0]?.message?.content || "").trim();
      // Sem as três linhas: marca para não tentar de novo a cada minuto.
      const ok = /Problema:/i.test(art) && /Solu[cç][aã]o:/i.test(art);
      await prisma.workTicket.update({ where: { ticketId: t.ticketId }, data: { kbArticle: ok ? art.slice(0, 1200) : "-" } });
      if (ok) n++;
    } catch (err) {
      console.error("[trabalho] base de conhecimento:", err instanceof Error ? err.message : err);
      break; // sem rede/crédito: tenta no próximo minuto
    }
  }
  return n;
}
