import { prisma } from "./prisma";

// Crédito da OpenRouter (pedido dele, 20/10/2026: o crédito acabou e a
// secretária parou de ler vídeo/nota/áudio sem aviso). Toda a IA passa por lá.

/** Abaixo disso (US$) avisa no WhatsApp. */
export const CREDIT_WARN_USD = 2;

/** Saldo em US$ (comprado − usado), ou null se não deu para consultar. */
export async function openrouterCredit(): Promise<{ restante: number; comprado: number } | null> {
  const cfg = await prisma.agentConfig.findFirst({ select: { openrouterApiKey: true } });
  if (!cfg?.openrouterApiKey) return null;
  try {
    const r = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${cfg.openrouterApiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const d = (await r.json())?.data;
    if (typeof d?.total_credits !== "number" || typeof d?.total_usage !== "number") return null;
    return { restante: Math.max(0, d.total_credits - d.total_usage), comprado: d.total_credits };
  } catch {
    return null;
  }
}

const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Texto do aviso, ou "" se o saldo está ok. */
export async function creditWarning(): Promise<string> {
  const c = await openrouterCredit();
  if (!c || c.restante >= CREDIT_WARN_USD) return "";
  return c.restante < 0.5
    ? `🚨 *Crédito da IA quase zerado:* ${usd(c.restante)}. Quando acabar, eu paro de entender mensagens, nota, áudio e vídeo (e o corretor da extensão). Coloque crédito em openrouter.ai › Credits.`
    : `⚠️ *Crédito da IA baixo:* sobram ${usd(c.restante)} de ${usd(c.comprado)}. Coloque mais em openrouter.ai › Credits antes que acabe.`;
}

/** "crédito da ia?" no WhatsApp. null = não é esse comando. */
export async function applyCreditCommand(text: string): Promise<string | null> {
  if (!/^\s*(?:quanto\s+(?:tem\s+(?:de\s+)?|de\s+)?)?cr[eé]dito(?:s)?\s+(?:da\s+)?(?:ia|openrouter)\s*\??\s*$/i.test(text)) return null;
  const c = await openrouterCredit();
  if (!c) return "🤖 Não consegui consultar o crédito da OpenRouter agora.";
  return `🤖 Crédito da IA: *${usd(c.restante)}* de ${usd(c.comprado)} comprados.${c.restante < CREDIT_WARN_USD ? " ⚠️ Está baixo — coloque mais em openrouter.ai › Credits." : " 👍"}`;
}
