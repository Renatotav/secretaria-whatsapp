import { prisma } from "./prisma";

// Jev (TypeSafe, pelo OpenRouter): modelo de DECISÃO — não escreve texto,
// escolhe entre opções e devolve a certeza. ~0,5 s e frações de centavo por
// decisão. Usa a chave do OpenRouter que já está na secretária.
// Endpoint próprio: POST /api/alpha/decisions { model, state, questions }.

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevAnswer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "noul"; noul: number }
  | { type: "score"; score: number; confidence: number };

export async function decide(
  state: string | Record<string, unknown>,
  questions: Record<string, JevQuestion>
): Promise<Record<string, JevAnswer>> {
  const config = await prisma.agentConfig.findFirst({ select: { openrouterApiKey: true, decisionModel: true } });
  if (!config?.openrouterApiKey) throw new Error("Sem chave do OpenRouter");
  const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.openrouterApiKey}` },
    body: JSON.stringify({ model: config.decisionModel || "typesafe/jev-1.13", state, questions }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Jev ${res.status}: ${body?.error?.message?.slice(0, 200) ?? "erro"}`);
  return body.answers ?? {};
}

/** Uma escolha só; null se a certeza ficar abaixo do mínimo. */
export async function choose(state: string, instructions: string, criteria: Record<string, string>, min = 0.5): Promise<{ choice: string; confidence: number } | null> {
  const a = (await decide(state, { q: { type: "choice", instructions, criteria } })).q;
  if (!a || a.type !== "choice" || a.confidence < min) return null;
  return { choice: a.choice, confidence: a.confidence };
}
