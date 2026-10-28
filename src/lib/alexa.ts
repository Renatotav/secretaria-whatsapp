import { prisma } from "./prisma";

// A Alexa (Echo Dot) fala alguns avisos da secretária quando ele está em casa,
// pelo Voice Monkey (skill da Alexa). Fora do horário de silêncio; nunca trava
// o resto: se a Alexa falhar, o aviso continua indo pelo WhatsApp.
//   "alexa token <chave>" · "alexa dispositivo <id>" · "alexa silêncio 22-7" · "alexa teste"
// Ele quase não fica em casa: antes de falar, ela vê se ele está FORA —
//   · usou a extensão do trabalho nos últimos 45 min (está no trabalho), ou
//   · mandou "saí" no WhatsApp (vale até "cheguei" ou por 14 h).
// Fora de casa, o aviso fica guardado (até 5, por 12 h) e é falado num resumo
// quando ele manda "cheguei". O WhatsApp continua recebendo tudo como sempre.

const API = "https://api-v3.voicemonkey.io/announce";

function quieto(faixa: string): boolean {
  const m = faixa.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return false;
  const de = Number(m[1]), ate = Number(m[2]);
  const h = new Date(Date.now() - 3 * 3600_000).getUTCHours(); // hora de Brasília
  return de > ate ? h >= de || h < ate : h >= de && h < ate;
}

const TRABALHO_MIN = 45;
const FORA_MAX_H = 14;
const FILA_MAX = 5;
const FILA_H = 12;

type Presenca = { fora: boolean; motivo: string };
type Fila = { at: string; texto: string }[];

/** Ele está fora de casa? Celular no Wi-Fi de casa manda; sem esse sinal, extensão do trabalho ou "saí". */
export async function presenca(): Promise<Presenca> {
  const cfg = await prisma.agentConfig.findFirst({ select: { alexaAwayUntil: true, workSeenAt: true, phoneHome: true, phoneSeenAt: true } });
  const agora = Date.now();
  // Sinal do celular com até 10 min é o mais confiável (o vigia manda a cada minuto).
  if (cfg?.phoneHome !== null && cfg?.phoneHome !== undefined && cfg.phoneSeenAt && agora - cfg.phoneSeenAt.getTime() < 10 * 60_000) {
    return cfg.phoneHome ? { fora: false, motivo: "" } : { fora: true, motivo: "o celular não está no Wi-Fi de casa" };
  }
  if (cfg?.alexaAwayUntil && cfg.alexaAwayUntil.getTime() > agora) return { fora: true, motivo: "você avisou que saiu" };
  if (cfg?.workSeenAt && agora - cfg.workSeenAt.getTime() < TRABALHO_MIN * 60_000) return { fora: true, motivo: "você está usando a Central no trabalho" };
  return { fora: false, motivo: "" };
}

/** A extensão do trabalho falou com a secretária: ele está no trabalho (grava no máx. 1x/min). */
export async function marcarNoTrabalho(): Promise<void> {
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true, workSeenAt: true } });
  if (!cfg || (cfg.workSeenAt && Date.now() - cfg.workSeenAt.getTime() < 60_000)) return;
  await prisma.agentConfig.update({ where: { id: cfg.id }, data: { workSeenAt: new Date() } }).catch(() => {});
}

const lerFila = (raw: string): Fila => {
  try {
    const f = JSON.parse(raw || "[]");
    return Array.isArray(f) ? f.filter((x) => x && typeof x.texto === "string" && Date.now() - new Date(x.at).getTime() < FILA_H * 3600_000) : [];
  } catch {
    return [];
  }
};

async function guardar(texto: string): Promise<void> {
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true, alexaQueue: true } });
  if (!cfg) return;
  const fila = lerFila(cfg.alexaQueue).filter((x) => x.texto !== texto);
  fila.push({ at: new Date().toISOString(), texto });
  await prisma.agentConfig.update({ where: { id: cfg.id }, data: { alexaQueue: JSON.stringify(fila.slice(-FILA_MAX)) } });
}

/**
 * Fala o texto num Echo Dot. Devolve se falou (false = sem configuração,
 * silêncio, fora de casa ou erro). Fora de casa, guarda para o "cheguei".
 */
export async function alexaFalar(texto: string, ignorarSilencio = false): Promise<boolean> {
  const cfg = await prisma.agentConfig.findFirst({ select: { alexaToken: true, alexaDevice: true, alexaQuiet: true } });
  if (!cfg?.alexaToken || !cfg.alexaDevice) return false;
  if (!ignorarSilencio && (await presenca()).fora) {
    await guardar(texto).catch(() => {});
    return false;
  }
  if (!ignorarSilencio && quieto(cfg.alexaQuiet)) return false;
  return enviar(cfg.alexaToken, cfg.alexaDevice, texto);
}

async function enviar(token: string, device: string, texto: string): Promise<boolean> {
  const cfg = { alexaToken: token, alexaDevice: device };
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

const SAI_RE = /^\s*(sa[ií](ndo)?|t[oô] saindo|vou sair)(\s+de\s+casa)?\s*[.!]*\s*$/i;
const CHEGUEI_RE = /^\s*(cheguei|t[oô] em casa|estou em casa|em casa)(\s+em\s+casa)?\s*[.!]*\s*$/i;

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Texto do resumo da manhã: agenda de hoje, contas de hoje/amanhã e a scooter. */
export async function resumoManha(): Promise<string> {
  const brt = new Date(Date.now() - 3 * 3600_000);
  const partes = [`Bom dia, Renato. Hoje é ${DIAS[brt.getUTCDay()]}, ${brt.getUTCDate()} de ${MESES[brt.getUTCMonth()]}.`];
  // Agenda: o que vence hoje (horário de Brasília), até 3 itens.
  const ini = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3));
  const fim = new Date(ini.getTime() + 86_400_000);
  const itens = await prisma.agendaItem.findMany({ where: { done: false, dueDate: { gte: ini, lt: fim } }, orderBy: { dueDate: "asc" }, take: 3 });
  if (itens.length) {
    const hora = (d: Date) => {
      const b = new Date(d.getTime() - 3 * 3600_000);
      const h = b.getUTCHours(), m = b.getUTCMinutes();
      return h === 0 && m === 0 ? "" : ` às ${h}${m ? ` e ${m}` : " horas"}`;
    };
    partes.push(`Na agenda: ${itens.map((i) => `${i.title.replace(/[*_]/g, "").slice(0, 80)}${i.dueDate ? hora(i.dueDate) : ""}`).join("; ")}.`);
  } else partes.push("Nada marcado na agenda para hoje.");
  try {
    const { outlookMeetings, meetingsSpeech } = await import("./outlook-calendar");
    const reunioes = await outlookMeetings();
    if (reunioes?.length) partes.push(`Reuniões do trabalho: ${meetingsSpeech(reunioes)}.`);
  } catch {}
  try {
    const { airconOntem } = await import("./aircon");
    const ar = await airconOntem();
    if (ar && ar.kwh > 0.5) partes.push(`Ontem o ar gastou ${ar.reais.toLocaleString("pt-BR", { maximumFractionDigits: 2 }).replace(".", ",")} reais.`);
  } catch {}
  try {
    const { billsDueSpeech } = await import("./message-handlers");
    const contas = (await billsDueSpeech()).replace(/^Renato,\s*lembrete de contas:\s*/i, "");
    if (contas) partes.push(`Contas: ${contas}`);
  } catch {}
  try {
    const { scooterNumbers, TIRE_PSI } = await import("./scooter");
    const n = await scooterNumbers();
    if (n && n.kmSince !== null) {
      const folga = Math.round(n.safeKm - n.kmSince);
      if (folga <= 0) partes.push("Scooter: carregue hoje, já passou do ponto seguro.");
      else if (folga <= 8) partes.push(`Scooter: dá uns ${folga} quilômetros, é bom carregar hoje.`);
      else partes.push(`Scooter com folga de uns ${folga} quilômetros.`);
    }
    if (n?.lastTire && n.tireDue) partes.push(`E calibre os pneus: ${TIRE_PSI.front} na frente e ${TIRE_PSI.rear} atrás.`);
  } catch {}
  try {
    const { cardLimitSpeech } = await import("./message-handlers");
    partes.push(await cardLimitSpeech());
  } catch {}
  return partes.join(" ");
}

/** Sábado/domingo de manhã: dia de calibrar (só se já passou o prazo e ele não calibrou). */
export async function falarPneus(): Promise<boolean> {
  const { scooterNumbers, TIRE_PSI } = await import("./scooter");
  const n = await scooterNumbers().catch(() => null);
  if (!n?.lastTire || !n.tireDue) return false;
  return alexaFalar(`Bom dia, Renato. Hoje é dia de calibrar os pneus da scooter: ${TIRE_PSI.front} na frente e ${TIRE_PSI.rear} atrás. Depois me avise: calibrei os pneus.`);
}

/** Agendador: fala o resumo da manhã (seg–sex, no horário escolhido). Fala mesmo no "silêncio" — ele escolheu a hora. */
export async function falarResumoManha(): Promise<boolean> {
  const cfg = await prisma.agentConfig.findFirst({ select: { alexaToken: true, alexaDevice: true, alexaAwayUntil: true } });
  if (!cfg?.alexaToken || !cfg.alexaDevice) return false;
  if (cfg.alexaAwayUntil && cfg.alexaAwayUntil.getTime() > Date.now()) return false; // avisou que saiu (dormiu fora)
  return enviar(cfg.alexaToken, cfg.alexaDevice, await resumoManha());
}

/** "saí" / "cheguei" / "alexa casa?" pelo WhatsApp. null = não é isso. */
async function comandoCasa(t: string): Promise<string | null> {
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true, alexaToken: true, alexaDevice: true, alexaQueue: true, alexaQuiet: true } });
  if (!cfg?.alexaToken || !cfg.alexaDevice) return null; // sem Alexa, "cheguei" segue o fluxo normal
  if (SAI_RE.test(t)) {
    await prisma.agentConfig.update({ where: { id: cfg.id }, data: { alexaAwayUntil: new Date(Date.now() + FORA_MAX_H * 3600_000) } });
    return "🏃 Beleza! A Alexa fica quieta até você mandar *cheguei* (os avisos continuam aqui no WhatsApp).";
  }
  if (CHEGUEI_RE.test(t)) return chegou(false);
  if (/^\s*alexa\s+casa\s*\??\s*$/i.test(t)) {
    const p = await presenca();
    const n = lerFila(cfg.alexaQueue).length;
    const cel = await prisma.agentConfig.findFirst({ select: { phoneSeenAt: true } });
    const fonte = cel?.phoneSeenAt && Date.now() - cel.phoneSeenAt.getTime() < 10 * 60_000 ? " (pelo celular no Wi-Fi)" : "";
    return p.fora ? `🏃 Para a Alexa você está *fora*${fonte || ` (${p.motivo})`}. ${n} aviso(s) guardado(s) para quando chegar.` : `🏠 Para a Alexa você está *em casa*${fonte}: ela fala os avisos (fora do silêncio).`;
  }
  return null;
}

/**
 * Chegou em casa ("cheguei" no WhatsApp ou o celular entrou no Wi-Fi):
 * limpa o "fora" e fala o que ficou guardado + contas de hoje/amanhã.
 * automatico = veio do vigia do celular: só fala se tiver aviso guardado.
 */
export async function chegou(automatico: boolean): Promise<string> {
  const cfg = await prisma.agentConfig.findFirst({ select: { id: true, alexaToken: true, alexaDevice: true, alexaQueue: true, alexaQuiet: true } });
  if (!cfg?.alexaToken || !cfg.alexaDevice) return "";
  {
    const fila = lerFila(cfg.alexaQueue);
    await prisma.agentConfig.update({ where: { id: cfg.id }, data: { alexaAwayUntil: null, workSeenAt: null, alexaQueue: "[]" } });
    // Resumo falado: o que ficou guardado + contas de hoje/amanhã.
    const { billsDueSpeech } = await import("./message-handlers");
    const contas = await billsDueSpeech().catch(() => "");
    const partes = fila.map((x) => x.texto.replace(/^Renato,\s*/i, ""));
    if (automatico && !partes.length) return ""; // chegou sem nada guardado: não fala nada
    if (contas && !partes.some((p) => p.includes("lembrete de contas"))) partes.push(contas.replace(/^Renato,\s*/i, ""));
    // Como foi o dia no dinheiro: gasto de hoje e quanto ainda cabe no cartão.
    try {
      const { spentTodaySpeech, cardLimitSpeech } = await import("./message-handlers");
      partes.push(await spentTodaySpeech(), await cardLimitSpeech());
    } catch {}
    if (!partes.length) return "🏠 Bem-vindo! Nada guardado para a Alexa falar.";
    if (quieto(cfg.alexaQuiet)) return `🏠 Bem-vindo! Tinha ${partes.length} aviso(s), mas é horário de silêncio: ficam só aqui.\n• ${partes.join("\n• ")}`;
    const ok = await enviar(cfg.alexaToken, cfg.alexaDevice, `Bem-vindo, Renato. ${partes.join(" ")}`);
    return ok ? `🏠 Bem-vindo! A Alexa está falando ${partes.length} aviso(s) que guardei.` : `🏠 Bem-vindo! A Alexa não respondeu; os avisos eram:\n• ${partes.join("\n• ")}`;
  }
}

/** Comandos de configuração pelo WhatsApp. null = não é sobre a Alexa. */
export async function applyAlexaCommand(text: string): Promise<string | null> {
  const t = text.trim();
  const casa = await comandoCasa(t);
  if (casa) return casa;
  const sk = t.match(/^\s*alexa\s+skill\s*:?\s*(\S+)\s*$/i);
  if (sk) {
    if (!/^amzn1\.ask\.skill\.[0-9a-f-]{20,}$/i.test(sk[1])) return "🔊 Mande o *Skill ID* como aparece no console da Alexa (começa com amzn1.ask.skill.).";
    const c = await prisma.agentConfig.findFirst({ select: { id: true } });
    if (!c) return null;
    await prisma.agentConfig.update({ where: { id: c.id }, data: { alexaSkillId: sk[1] } });
    return "🔊 Skill guardada! Agora é só falar: *Alexa, pede pra minha secretária anotar 30 reais de mercado no pix*.";
  }
  const bd = t.match(/^\s*alexa\s+bom\s*dia\s*:?\s*(.*)$/i);
  if (bd) {
    const cfg0 = await prisma.agentConfig.findFirst({ select: { id: true, alexaMorning: true } });
    if (!cfg0) return null;
    const v = bd[1].trim();
    if (/^(desliga|desligar|off|n[aã]o|nenhum)/i.test(v)) {
      await prisma.agentConfig.update({ where: { id: cfg0.id }, data: { alexaMorning: "" } });
      return "🔊 Resumo da manhã desligado. Para voltar: *alexa bom dia 6:50*.";
    }
    if (/^(agora|teste|testar)$/i.test(v)) return (await falarResumoManha()) ? "🔊 A Alexa está falando o resumo da manhã agora." : "⚠️ A Alexa não falou (confira *alexa teste* ou se você mandou *saí*).";
    const h = v.match(/^(\d{1,2})\s*(?:[:h]\s*(\d{2}))?$/i);
    if (!v) return cfg0.alexaMorning ? `🔊 Resumo da manhã: seg a sex às ${cfg0.alexaMorning}. Mude com *alexa bom dia 7:10*, desligue com *alexa bom dia desliga*, ouça já com *alexa bom dia agora*.` : "🔊 Resumo da manhã desligado. Ligue com *alexa bom dia 6:50*.";
    if (!h || Number(h[1]) > 23 || Number(h[2] ?? 0) > 59) return "🔊 Mande assim: *alexa bom dia 6:50*.";
    const hhmm = `${String(Number(h[1])).padStart(2, "0")}:${h[2] ?? "00"}`;
    await prisma.agentConfig.update({ where: { id: cfg0.id }, data: { alexaMorning: hhmm } });
    return `🔊 Combinado: de segunda a sexta, às ${hhmm}, a Alexa fala a agenda, as contas e a scooter.`;
  }
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
