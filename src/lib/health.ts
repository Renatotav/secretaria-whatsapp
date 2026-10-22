import { prisma } from "./prisma";
import type { AgentConfig } from "@prisma/client";

// Saúde do sistema: o WhatsApp (Evolution) é conferido a cada 5 min — se cair,
// a Alexa avisa (o WhatsApp não chega) e, quando volta, vai a mensagem com o
// tempo fora. "como está o sistema?" junta tudo numa resposta.

type WaState = "open" | "close" | "connecting" | "erro";

export async function whatsappState(config: Pick<AgentConfig, "evolutionUrl" | "evolutionApiKey" | "instanceId">): Promise<WaState> {
  if (!config.evolutionUrl || !config.instanceId) return "erro";
  try {
    const r = await fetch(`${config.evolutionUrl.replace(/\/$/, "")}/instance/connectionState/${encodeURIComponent(config.instanceId)}`, {
      headers: { apikey: config.evolutionApiKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return "erro";
    const j = (await r.json()) as { instance?: { state?: string }; state?: string };
    const s = j.instance?.state ?? j.state;
    return s === "open" || s === "close" || s === "connecting" ? s : "erro";
  } catch {
    return "erro";
  }
}

const KEY = "health:whatsapp";
type WaHealth = { downSince: string | null; alerted: boolean; fails: number };

async function getKv<T>(key: string): Promise<T | null> {
  const row = await prisma.flowState.findUnique({ where: { key } });
  return (row?.value as T) ?? null;
}
async function setKv(key: string, value: object): Promise<void> {
  await prisma.flowState.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Chamado pelo agendador a cada 5 min. 2 falhas seguidas (≈10 min) = caiu. */
export async function checkWhatsapp(config: AgentConfig): Promise<void> {
  const state = await whatsappState(config);
  const h = (await getKv<WaHealth>(KEY)) ?? { downSince: null, alerted: false, fails: 0 };
  if (state === "open") {
    if (h.downSince && h.alerted) {
      const min = Math.round((Date.now() - new Date(h.downSince).getTime()) / 60000);
      const { notifyOwner } = await import("./message-handlers");
      await notifyOwner(config, `✅ O WhatsApp da secretária voltou (ficou uns ${min} min desconectado). Mensagens mandadas nesse meio-tempo podem não ter chegado — se lançou algo, confira com "quanto gastei hoje?".`).catch(() => {});
    }
    if (h.downSince || h.fails) await setKv(KEY, { downSince: null, alerted: false, fails: 0 });
    return;
  }
  // "erro" de rede uma vez é comum; só conta como caído se repetir.
  const fails = h.fails + 1;
  const downSince = h.downSince ?? new Date(Date.now() - 5 * 60000).toISOString();
  let alerted = h.alerted;
  if (fails >= 2 && !alerted) {
    console.warn(`[saúde] WhatsApp fora (${state}) desde ${downSince}`);
    const { alexaFalar } = await import("./alexa");
    await alexaFalar("Atenção: o WhatsApp da secretária desconectou. Abra o painel da Evolution e leia o QR code de novo.").catch(() => false);
    alerted = true;
  }
  await setKv(KEY, { downSince, alerted, fails });
}

/** O vigia da tomada avisou que a ponte caiu/voltou (guardado para o "como está o sistema?"). */
export async function notePonte(state: "down" | "up"): Promise<void> {
  await setKv("health:ponte", { state, at: new Date().toISOString() }).catch(() => {});
}

const ha = (iso: string | Date) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} dias`;
};

export async function healthReport(config: AgentConfig): Promise<string> {
  const linhas: string[] = [];
  const wa = await whatsappState(config);
  linhas.push(wa === "open" ? "🟢 WhatsApp conectado" : `🔴 WhatsApp ${wa === "close" ? "desconectado" : wa === "connecting" ? "reconectando" : "sem resposta da Evolution"}`);

  const ultima = await prisma.processedMessage.findFirst({ orderBy: { at: "desc" }, select: { at: true } });
  if (ultima) linhas.push(`📨 Última mensagem recebida: há ${ha(ultima.at)}`);

  const ponte = await getKv<{ state: string; at: string }>("health:ponte");
  linhas.push(ponte ? (ponte.state === "down" ? `🔴 Ponte da tomada fora desde há ${ha(ponte.at)}` : `🟢 Ponte da tomada ok (último aviso: voltou há ${ha(ponte.at)})`) : "🟢 Ponte da tomada: nenhum aviso de queda");

  const { openrouterCredit, CREDIT_WARN_USD } = await import("./ai-credit");
  const c = await openrouterCredit().catch(() => null);
  linhas.push(!c ? "🟡 Crédito da IA: não consegui consultar" : `${c.restante < CREDIT_WARN_USD ? "🔴" : "🟢"} Crédito da IA: US$ ${c.restante.toFixed(2).replace(".", ",")}`);

  const sha = (process.env.GIT_SHA || "").slice(0, 7);
  linhas.push(`🟢 No ar há ${ha(new Date(Date.now() - process.uptime() * 1000))}${sha ? ` (versão ${sha})` : ""}`);

  const hoje = await prisma.financeLog.count({ where: { at: { gte: new Date(Date.now() - 24 * 3600_000) } } });
  linhas.push(`🕓 Mudanças no financeiro nas últimas 24 h: ${hoje}`);

  return `🩺 *Saúde do sistema*\n${linhas.join("\n")}`;
}

/** "como está o sistema?", "saúde do sistema", "status do sistema". null = não é esse comando. */
export async function applyHealthCommand(text: string, config: AgentConfig): Promise<string | null> {
  if (!/^\s*(?:como\s+(?:est[aá]|t[aá])\s+o\s+sistema|sa[uú]de\s+do\s+sistema|status\s+do\s+sistema)\s*\??\s*$/i.test(text)) return null;
  return healthReport(config);
}
