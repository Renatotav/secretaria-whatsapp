import { prisma } from "./prisma";

// A Alexa (Echo Dot) fala alguns avisos da secretária quando ele está em casa,
// pelo Voice Monkey (skill da Alexa). Fora do horário de silêncio; nunca trava
// o resto: se a Alexa falhar, o aviso continua indo pelo WhatsApp.
//   "alexa token <chave>" · "alexa dispositivo <id>" · "alexa silêncio 22-7" · "alexa teste"

const API = "https://api-v3.voicemonkey.io/announce";

function quieto(faixa: string): boolean {
  const m = faixa.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return false;
  const de = Number(m[1]), ate = Number(m[2]);
  const h = new Date(Date.now() - 3 * 3600_000).getUTCHours(); // hora de Brasília
  return de > ate ? h >= de || h < ate : h >= de && h < ate;
}

/** Fala o texto num Echo Dot. Devolve se falou (false = sem configuração, silêncio ou erro). */
export async function alexaFalar(texto: string, ignorarSilencio = false): Promise<boolean> {
  const cfg = await prisma.agentConfig.findFirst({ select: { alexaToken: true, alexaDevice: true, alexaQuiet: true } });
  if (!cfg?.alexaToken || !cfg.alexaDevice) return false;
  if (!ignorarSilencio && quieto(cfg.alexaQuiet)) return false;
  try {
    const r = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: cfg.alexaToken, device: cfg.alexaDevice, speech: texto.slice(0, 500) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) console.error("[alexa] Voice Monkey respondeu", r.status);
    return r.ok;
  } catch (err) {
    console.error("[alexa] falhou", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Comandos de configuração pelo WhatsApp. null = não é sobre a Alexa. */
export async function applyAlexaCommand(text: string): Promise<string | null> {
  const t = text.trim();
  const m = t.match(/^\s*alexa\s+(token|chave|dispositivo|aparelho|device|sil[eê]ncio|teste)\s*:?\s*(.*)$/i);
  if (!m) return null;
  const campo = m[1].toLowerCase();
  const valor = m[2].trim();
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true, alexaToken: true, alexaDevice: true, alexaQuiet: true } });
  if (!cfg) return null;
  if (campo === "token" || campo === "chave") {
    if (valor.length < 20 || /\s/.test(valor)) return "🔊 Essa chave parece incompleta. Copie o *API Token* inteiro do Voice Monkey e mande: *alexa token SUA_CHAVE*.";
    await prisma.agentConfig.update({ where: { id: cfg.id }, data: { alexaToken: valor } });
    return `🔊 Chave do Voice Monkey guardada.${cfg.alexaDevice ? " Mande *alexa teste* para ouvir." : " Agora mande o ID do Echo: *alexa dispositivo ID_DO_APARELHO*."}`;
  }
  if (campo === "dispositivo" || campo === "aparelho" || campo === "device") {
    if (!/^[\w-]{2,80}$/.test(valor)) return "🔊 Mande o ID do aparelho como aparece no Voice Monkey (ex: *alexa dispositivo echo-sala*).";
    await prisma.agentConfig.update({ where: { id: cfg.id }, data: { alexaDevice: valor } });
    return `🔊 Aparelho guardado: ${valor}.${cfg.alexaToken ? " Mande *alexa teste* para ouvir." : " Falta a chave: *alexa token SUA_CHAVE*."}`;
  }
  if (campo.startsWith("sil")) {
    if (/^(nenhum|n[aã]o|off|desliga)/i.test(valor)) {
      await prisma.agentConfig.update({ where: { id: cfg.id }, data: { alexaQuiet: "" } });
      return "🔊 Sem horário de silêncio: a Alexa fala a qualquer hora.";
    }
    const h = valor.match(/^(\d{1,2})\s*(?:h)?\s*(?:-|às?|a|ate|até)\s*(\d{1,2})/i);
    if (!h || Number(h[1]) > 23 || Number(h[2]) > 23) return "🔊 Mande assim: *alexa silêncio 22-7* (das 22h às 7h ela não fala).";
    await prisma.agentConfig.update({ where: { id: cfg.id }, data: { alexaQuiet: `${Number(h[1])}-${Number(h[2])}` } });
    return `🔊 Silêncio das ${Number(h[1])}h às ${Number(h[2])}h: nesse horário os avisos vão só pelo WhatsApp.`;
  }
  // teste
  if (!cfg.alexaToken || !cfg.alexaDevice) return "🔊 Ainda falta configurar: *alexa token SUA_CHAVE* e *alexa dispositivo ID_DO_APARELHO* (do Voice Monkey).";
  const ok = await alexaFalar("Oi, Renato! Aqui é a sua secretária. A partir de agora eu aviso por aqui quando a carga da scooter terminar.", true);
  return ok ? "🔊 Mandei para a Alexa — ela deve ter falado agora." : "⚠️ O Voice Monkey não aceitou. Confere a chave e o ID do aparelho no site deles.";
}
