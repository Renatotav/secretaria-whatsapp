import { prisma } from "./prisma";
import { brl } from "./format";

// Gasto do ar-condicionado (Samsung, pelo SmartThings). SÓ LEITURA: lê o
// contador total de energia do aparelho de hora em hora; daí sai kWh e R$ por
// dia e por mês. A chave do SmartThings vence em 24 h (regra da Samsung): ele
// manda uma nova pelo WhatsApp ("chave smartthings <chave>") e, como o contador
// é total, o que gastou com a chave vencida entra na conta na leitura seguinte.

const KEY = "smartthings";
type Cfg = {
  token?: string;
  deviceId?: string;
  /** 1ª leitura (Wh do contador) de cada dia, horário de Brasília: "AAAA-MM-DD" → Wh. */
  days?: Record<string, number>;
  last?: { at: string; wh: number; w: number | null };
  expiredWarned?: boolean;
  /** Contas da Enel (casa toda), do print do site: referência "AAAA-MM", kWh e R$. */
  enel?: { ref: string; kwh: number; valor: number }[];
  /**
   * Ponto de partida tirado do app SmartThings (prints dele): no contador `wh`, o mês
   * `mes` já tinha `mesKwh` e o dia `dia` já tinha `diaKwh`. Medição daqui em diante soma.
   */
  base?: { wh: number; mes: string; mesKwh: number; dia: string; diaKwh: number };
  /** Gasto do ar por mês, do gráfico "Histórico › Mensal" do app SmartThings (print dele). */
  arMeses?: { ref: string; kwh: number }[];
  /** Gasto por semana, do "Histórico › Semanal" do app (prints dele): datas AAAA-MM-DD. */
  arSemanas?: { de: string; ate: string; kwh: number }[];
  /** Quando o ar entrou no SmartThings (o contador total começa aí). */
  installed?: string;
};

async function cfg(): Promise<Cfg> {
  const r = await prisma.flowState.findUnique({ where: { key: KEY } });
  return (r?.value as Cfg | null) ?? {};
}
async function save(c: Cfg): Promise<void> {
  const value = JSON.parse(JSON.stringify(c));
  await prisma.flowState.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

const brtDay = (d = new Date()) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const kwh = (wh: number) => (wh / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

async function st(path: string, token: string) {
  const res = await fetch(`https://api.smartthings.com/v1${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error("chave vencida"), { expired: true });
  if (!res.ok) throw new Error(`SmartThings HTTP ${res.status}`);
  return res.json();
}

/** Lê o contador do ar e guarda. "expired" = a chave venceu (precisa de outra). */
export async function readAircon(): Promise<{ ok: true } | { ok: false; expired: boolean; error?: string }> {
  const c = await cfg();
  if (!c.token) return { ok: false, expired: false, error: "sem chave" };
  try {
    if (!c.deviceId) {
      const list = await st("/devices", c.token);
      const ac = (list.items ?? []).find((d: { deviceTypeName?: string; components?: { capabilities?: { id: string }[] }[] }) =>
        d.components?.some((k) => k.capabilities?.some((x) => x.id === "powerConsumptionReport")) && /air ?conditioner|ar-?condicionado/i.test(JSON.stringify(d)));
      if (!ac) return { ok: false, expired: false, error: "ar-condicionado não encontrado" };
      c.deviceId = ac.deviceId;
    }
    const s = await st(`/devices/${c.deviceId}/components/main/capabilities/powerConsumptionReport/status`, c.token);
    const v = s?.powerConsumption?.value;
    if (typeof v?.energy !== "number") return { ok: false, expired: false, error: "o ar não mandou o consumo" };
    const day = brtDay();
    c.days = c.days ?? {};
    if (c.days[day] === undefined) c.days[day] = v.energy;
    c.last = { at: new Date().toISOString(), wh: v.energy, w: typeof v.power === "number" ? v.power : null };
    c.expiredWarned = false;
    await save(c);
    return { ok: true };
  } catch (e) {
    const expired = !!(e as { expired?: boolean }).expired;
    if (expired) await save({ ...c, expiredWarned: true });
    return { ok: false, expired, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Agendador (de hora em hora): lê; se a chave venceu, devolve o aviso UMA vez. */
export async function airconTick(): Promise<string | null> {
  const before = await cfg();
  if (!before.token) return null;
  const r = await readAircon();
  if (!r.ok && r.expired && !before.expiredWarned) {
    // A Alexa também avisa (se ele estiver fora, guarda para o "cheguei"). Import aqui: alexa.ts importa este arquivo.
    const { alexaFalar } = await import("./alexa");
    await alexaFalar("A chave do ar-condicionado venceu. Gere uma nova no SmartThings e cole no WhatsApp da secretária.").catch(() => false);
    return "🔑 A chave do SmartThings venceu (a Samsung só deixa 24 h).\n1. Toque: https://account.smartthings.com/tokens\n2. Gere uma nova e copie\n3. Cole aqui, só a chave\nO gasto do ar não se perde nesse meio-tempo.";
  }
  return null;
}

/** Sinal da chave do SmartThings para a tela 🚦 Saúde e o "como está o sistema?". */
export async function airconKeyHealth(): Promise<{ nivel: "ok" | "atencao" | "problema"; titulo: string; detalhe: string }> {
  const c = await cfg();
  const titulo = "Chave do ar (SmartThings)";
  if (!c.token) return { nivel: "atencao", titulo, detalhe: "sem chave — cole uma no WhatsApp" };
  if (c.expiredWarned) return { nivel: "problema", titulo, detalhe: "venceu — gere em account.smartthings.com/tokens e cole só a chave no WhatsApp" };
  const h = c.last ? Math.round((Date.now() - new Date(c.last.at).getTime()) / 3600_000) : null;
  return h != null && h > 3
    ? { nivel: "atencao", titulo, detalhe: `sem leitura há ${h} h` }
    : { nivel: "ok", titulo, detalhe: "funcionando" };
}

/** kWh gastos entre o 1º registro do dia `from` (ou o mais antigo depois dele) e a última leitura. */
export function spentSince(c: Cfg, from: string): number | null {
  if (!c.last || !c.days) return null;
  // Mês ou dia que começou antes da medição: o que o app já mostrava + o medido depois.
  const b = c.base;
  if (b && (from === b.dia || from === b.mes + "-01")) return (from === b.dia ? b.diaKwh : b.mesKwh) * 1000 + Math.max(0, c.last.wh - b.wh);
  const start = Object.keys(c.days).filter((d) => d >= from).sort()[0];
  return start === undefined ? null : Math.max(0, c.last.wh - c.days[start]);
}

async function summary(): Promise<string> {
  const c = await cfg();
  if (!c.last) return "❄️ Ainda não tenho leitura do ar. Mande *chave smartthings* + a chave (account.smartthings.com/tokens).";
  const price = (await prisma.agentConfig.findFirst({ select: { kwhPrice: true } }))?.kwhPrice ?? 0.95;
  const today = brtDay();
  const month = today.slice(0, 8) + "01";
  const firstDay = Object.keys(c.days ?? {}).sort()[0];
  const hoje = spentSince(c, today) ?? 0;
  const mes = spentSince(c, month) ?? 0;
  const desde = firstDay && firstDay > month && c.base?.mes !== month.slice(0, 7) ? ` (desde ${firstDay.slice(8, 10)}/${firstDay.slice(5, 7)}, quando comecei a medir)` : "";
  const quando = new Date(new Date(c.last.at).getTime() - 3 * 3600_000).toISOString().slice(11, 16);
  return [
    "❄️ *Ar-condicionado*",
    `Hoje: ${kwh(hoje)} kWh · ${brl((hoje / 1000) * price)}`,
    `No mês${desde}: ${kwh(mes)} kWh · ${brl((mes / 1000) * price)}`,
    c.last.w != null ? `Agora: ${Math.round(c.last.w)} W (leitura das ${quando})` : "",
    c.expiredWarned ? "🔑 A chave venceu: mande *chave smartthings* + uma nova para eu continuar medindo." : "",
  ].filter(Boolean).join("\n");
}

/** "chave smartthings <chave>" e "quanto gastei de ar?". */
export async function applyAirconCommand(text: string): Promise<string | null> {
  const t = text.trim();
  // Chave com "chave"/"token"/"smart…" na frente, escrito de qualquer jeito ("smarthings",
  // "SMARTTHINGS <chave>" — em 28/10 os dois foram parar na conversa).
  const tok = t.match(/^(?=[^\n]*\b(?:chave|token|smart))(?:[a-zà-ú]+\s+){1,4}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i);
  // Basta colar a chave sozinha.
  const solta = !tok && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? [t, t] : null;
  if (tok || solta) {
    const novo = (tok ?? solta)![1];
    await save({ ...(await cfg()), token: novo.toLowerCase(), expiredWarned: false });
    const r = await readAircon();
    return r.ok ? `🔑 Chave do SmartThings guardada.\n\n${await summary()}` : `⚠️ Guardei a chave, mas não consegui ler o ar: ${r.error}.`;
  }
  const q = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/^(?:quanto\s+(?:vem|vai\s+vir|vai\s+ser|fica)\s+(?:a\s+)?conta\s+(?:de\s+luz|da\s+enel|de\s+energia)|previsao\s+da\s+(?:enel|conta\s+de\s+luz))\s*\??$/.test(q)) {
    await readAircon();
    const p = previsaoEnel(await cfg());
    if (!p) return "⚡ Ainda não tenho dados para prever a conta (preciso das contas da Enel e do ar).";
    return `⚡ *Próxima conta da Enel* (ref. ${p.ref.slice(5, 7)}/${p.ref.slice(0, 4)}, estimativa): ~${Math.round(p.kwh)} kWh ≈ ${brl(p.valor)}.\nO ar deve ser ~${Math.round(p.arKwh)} kWh disso; o resto é a média da casa. Tarifa com impostos das suas contas.`;
  }
  if (/^(?:quanto\s+(?:eu\s+)?(?:gastei|gasto|ta\s+gastando|esta\s+gastando)\s+(?:de|com\s+o|no)\s+ar(?:-?condicionado)?|gasto\s+do\s+ar(?:-?condicionado)?|ar-?condicionado)\s*\??$/.test(q)) {
    await readAircon();
    return summary();
  }
  return null;
}

/** Dados da aba ❄️ Ar-condicionado do painel. */
export async function airconData() {
  const c = await cfg();
  const price = (await prisma.agentConfig.findFirst({ select: { kwhPrice: true } }))?.kwhPrice ?? 0.95;
  if (!c.last) return { empty: true as const, price, temToken: !!c.token };
  const today = brtDay();
  const keys = Object.keys(c.days ?? {}).sort();
  // kWh de cada dia = 1ª leitura do dia seguinte − 1ª deste (o último dia vai até a última leitura).
  // Com a chave vencida, um intervalo pode juntar vários dias: "ate" mostra até quando.
  const dias = keys.map((k, i) => {
    const fim = i + 1 < keys.length ? c.days![keys[i + 1]] : c.last!.wh;
    const ate = i + 1 < keys.length ? keys[i + 1] : null;
    const juntou = ate !== null && new Date(ate).getTime() - new Date(k).getTime() > 86_400_000;
    const antes = c.base?.dia === k ? c.base.diaKwh * 1000 + Math.max(0, c.days![k] - c.base.wh) : 0;
    return { dia: k, kwh: (Math.max(0, fim - c.days![k]) + antes) / 1000, ate: juntou ? ate : null };
  });
  const mes = (spentSince(c, today.slice(0, 8) + "01") ?? 0) / 1000;
  const hoje = (spentSince(c, today) ?? 0) / 1000;
  // Média do ar por mês desde a instalação (contador total ÷ meses), para comparar com as contas.
  const meses = c.installed ? (Date.now() - new Date(c.installed).getTime()) / (30.44 * 86_400_000) : null;
  const historico = (c.enel ?? []).slice().sort((a, b) => a.ref.localeCompare(b.ref));
  const enel = await prisma.financeEntry.findFirst({
    where: { type: "expense", description: { contains: "ENEL", mode: "insensitive" }, NOT: { description: { contains: "previsto" } } },
    orderBy: { date: "desc" },
    select: { amount: true, date: true },
  });
  return {
    empty: false as const,
    price,
    hoje,
    mes,
    // Com o ponto de partida do app, o mês já está completo desde o dia 1.
    desde: c.base?.mes === today.slice(0, 7) ? today.slice(0, 8) + "01" : keys[0],
    agoraW: c.last.w,
    lidoEm: c.last.at,
    totalKwh: c.last.wh / 1000,
    chaveVencida: !!c.expiredWarned,
    enel: enel ? { valor: enel.amount, data: enel.date } : null,
    dias: dias.slice(-31),
    // A conta de um mês mede o consumo do mês ANTERIOR (a de 01/2026, vence 15/01, é dezembro).
    historico: historico.map((h) => {
      const [y, m] = h.ref.split("-").map(Number);
      const antes = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
      return { ...h, ar: (c.arMeses ?? []).find((x) => x.ref === antes)?.kwh ?? null };
    }),
    previsao: previsaoEnel(c),
    semanas: (c.arSemanas ?? []).slice().sort((a, b) => a.de.localeCompare(b.de)),
    instalado: c.installed ?? null,
    arMediaMesKwh: meses && meses >= 1 ? c.last.wh / 1000 / meses : null,
  };
}

/** kWh de ontem (1ª leitura de ontem → 1ª de hoje); null se não mediu os dois. */
export async function airconOntem(): Promise<{ kwh: number; reais: number } | null> {
  const c = await cfg();
  const hoje = brtDay(), ontem = brtDay(new Date(Date.now() - 86_400_000));
  if (!c.days?.[hoje] || !c.days?.[ontem]) return null;
  const antes = c.base?.dia === ontem ? c.base.diaKwh * 1000 + Math.max(0, c.days[ontem] - c.base.wh) : 0;
  const kwh = (Math.max(0, c.days[hoje] - c.days[ontem]) + antes) / 1000;
  const price = (await prisma.agentConfig.findFirst({ select: { kwhPrice: true } }))?.kwhPrice ?? 0.95;
  return { kwh, reais: kwh * price };
}

/**
 * Próxima conta da Enel: ela mede o mês ANTERIOR ao da referência. kWh = ar do mês
 * (projetado até o fim) + "resto da casa" (média das contas menos o ar, nos meses medidos);
 * R$ pela tarifa real média das contas (com impostos).
 */
export function previsaoEnel(c: Cfg): { ref: string; kwh: number; valor: number; arKwh: number } | null {
  const contas = (c.enel ?? []).slice().sort((a, b) => a.ref.localeCompare(b.ref));
  const anterior = (ref: string) => { const [y, m] = ref.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
  const medidos = contas.map((x) => ({ ...x, ar: (c.arMeses ?? []).find((a) => a.ref === anterior(x.ref))?.kwh })).filter((x) => x.ar != null && x.ar > 50);
  if (!medidos.length || !c.last) return null;
  const resto = medidos.reduce((a, x) => a + (x.kwh - x.ar!), 0) / medidos.length;
  const tarifa = medidos.reduce((a, x) => a + x.valor / x.kwh, 0) / medidos.length;
  const hoje = brtDay();
  const mes = hoje.slice(0, 7);
  const y = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const arAteHoje = (spentSince(c, mes + "-01") ?? 0) / 1000;
  const arKwh = (arAteHoje / Number(hoje.slice(8, 10))) * diasNoMes;
  const ref = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const kwh = arKwh + resto;
  return { ref, kwh, valor: kwh * tarifa, arKwh };
}

/** Saiu de casa e o ar continua ligado (≥30 min): avisa UMA vez por saída. */
export async function airconAwayCheck(): Promise<string | null> {
  const p = await prisma.flowState.findUnique({ where: { key: "presence:saiu" } });
  const saiu = p?.value as { at: string; avisado?: boolean } | null;
  if (!saiu || saiu.avisado) return null;
  const min = (Date.now() - new Date(saiu.at).getTime()) / 60_000;
  if (min < 30) return null;
  const r = await readAircon();
  const c = await cfg();
  if (!r.ok || !c.last?.w || c.last.w < 50) return null;
  await prisma.flowState.update({ where: { key: "presence:saiu" }, data: { value: { ...saiu, avisado: true } } });
  const price = (await prisma.agentConfig.findFirst({ select: { kwhPrice: true } }))?.kwhPrice ?? 0.95;
  return `❄️ Você saiu há ${Math.round(min)} min e o ar continua ligado (~${Math.round(c.last.w)} W ≈ ${brl((c.last.w / 1000) * price)} por hora). Se esqueceu, desligue pela Alexa.`;
}
