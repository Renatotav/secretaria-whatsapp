import { prisma } from "./prisma";

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
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  if (!r.ok && r.expired && !before.expiredWarned)
    return "🔑 A chave do SmartThings venceu (a Samsung só deixa 24 h). Gere outra em account.smartthings.com/tokens e me mande: *chave smartthings* + a chave. O gasto do ar não se perde nesse meio-tempo.";
  return null;
}

/** kWh gastos entre o 1º registro do dia `from` (ou o mais antigo depois dele) e a última leitura. */
export function spentSince(c: Cfg, from: string): number | null {
  if (!c.last || !c.days) return null;
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
  const desde = firstDay && firstDay > month ? ` (desde ${firstDay.slice(8, 10)}/${firstDay.slice(5, 7)}, quando comecei a medir)` : "";
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
  const tok = t.match(/^(?:chave|token)\s+(?:do\s+)?smart\s?things\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i);
  if (tok) {
    await save({ ...(await cfg()), token: tok[1].toLowerCase(), expiredWarned: false });
    const r = await readAircon();
    return r.ok ? `🔑 Chave do SmartThings guardada.\n\n${await summary()}` : `⚠️ Guardei a chave, mas não consegui ler o ar: ${r.error}.`;
  }
  const q = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
    return { dia: k, kwh: Math.max(0, fim - c.days![k]) / 1000, ate: juntou ? ate : null };
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
    desde: keys[0],
    agoraW: c.last.w,
    lidoEm: c.last.at,
    totalKwh: c.last.wh / 1000,
    chaveVencida: !!c.expiredWarned,
    enel: enel ? { valor: enel.amount, data: enel.date } : null,
    dias: dias.slice(-31),
    historico,
    instalado: c.installed ?? null,
    arMediaMesKwh: meses && meses >= 1 ? c.last.wh / 1000 / meses : null,
  };
}
