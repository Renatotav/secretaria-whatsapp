import { prisma } from "./prisma";
import type { AgentConfig } from "@prisma/client";
import { CREDIT_WARN_USD, DOLAR, openrouterCredit } from "./ai-credit";
import { brl } from "./format";
import { airconKeyHealth } from "./aircon";

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

export type HealthItem = { nivel: "ok" | "atencao" | "problema"; titulo: string; detalhe: string };

/** Cada parte do sistema com um sinal: o comando do WhatsApp e a tela 🚦 Saúde usam isto. */
export async function healthItems(config: AgentConfig): Promise<HealthItem[]> {
  const itens: HealthItem[] = [];
  const wa = await whatsappState(config);
  itens.push(wa === "open"
    ? { nivel: "ok", titulo: "WhatsApp", detalhe: "conectado" }
    : { nivel: "problema", titulo: "WhatsApp", detalhe: wa === "close" ? "desconectado — leia o QR code de novo em Instâncias" : wa === "connecting" ? "reconectando" : "a Evolution não respondeu" });

  const ultima = await prisma.processedMessage.findFirst({ orderBy: { at: "desc" }, select: { at: true } });
  itens.push(ultima
    ? { nivel: "ok", titulo: "Última mensagem recebida", detalhe: `há ${ha(ultima.at)}` }
    : { nivel: "atencao", titulo: "Última mensagem recebida", detalhe: "nenhuma registrada ainda" });

  const ponte = await getKv<{ state: string; at: string }>("health:ponte");
  itens.push(!ponte
    ? { nivel: "ok", titulo: "Ponte da tomada (scooter)", detalhe: "nenhum aviso de queda" }
    : ponte.state === "down"
      ? { nivel: "problema", titulo: "Ponte da tomada (scooter)", detalhe: `fora há ${ha(ponte.at)} — o Fire TV está ligado e no Wi-Fi?` }
      : { nivel: "ok", titulo: "Ponte da tomada (scooter)", detalhe: `ok (voltou há ${ha(ponte.at)})` });

  itens.push(await airconKeyHealth().catch(() => ({ nivel: "atencao" as const, titulo: "Chave do ar (SmartThings)", detalhe: "não consegui consultar" })));

  const c = await openrouterCredit().catch(() => null);
  itens.push(!c
    ? { nivel: "atencao", titulo: "Crédito da IA", detalhe: "não consegui consultar" }
    : { nivel: c.restante < CREDIT_WARN_USD ? "problema" : "ok", titulo: "Crédito da IA", detalhe: `US$ ${c.restante.toFixed(2).replace(".", ",")} (≈ ${brl(c.restante * DOLAR)})${c.restante < CREDIT_WARN_USD ? " — coloque mais em openrouter.ai › Credits" : ""}` });

  const sha = (process.env.GIT_SHA || "").slice(0, 7);
  itens.push({ nivel: "ok", titulo: "Secretária no ar", detalhe: `há ${ha(new Date(Date.now() - process.uptime() * 1000))}${sha ? ` · versão ${sha}` : ""}` });

  const mudancas = await prisma.financeLog.count({ where: { at: { gte: new Date(Date.now() - 24 * 3600_000) } } });
  itens.push({ nivel: "ok", titulo: "Mudanças no financeiro (24 h)", detalhe: String(mudancas) });
  return itens;
}

const ICONE = { ok: "🟢", atencao: "🟡", problema: "🔴" } as const;
export async function healthReport(config: AgentConfig): Promise<string> {
  const itens = await healthItems(config);
  return `🚦 *Saúde do sistema*\n${itens.map((i) => `${ICONE[i.nivel]} ${i.titulo}: ${i.detalhe}`).join("\n")}`;
}

/** "como está o sistema?", "saúde do sistema", "status do sistema". null = não é esse comando. */
export async function applyHealthCommand(text: string, config: AgentConfig): Promise<string | null> {
  if (!/^\s*(?:como\s+(?:est[aá]|t[aá])\s+o\s+sistema|sa[uú]de\s+do\s+sistema|status\s+do\s+sistema)\s*\??\s*$/i.test(text)) return null;
  return healthReport(config);
}
