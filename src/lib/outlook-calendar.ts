import { prisma } from "./prisma";

// Reuniões do Outlook do trabalho, lidas do calendário publicado (link .ics).
// O link fica no banco (FlowState "outlook:ics"), nunca no código: quem tem o
// link vê a agenda. Só leitura: a secretária nunca mexe na agenda do Outlook.

const KEY = "outlook:ics";
const CACHE_MS = 15 * 60_000;
const DAY = 86_400_000;

export type Meeting = { start: string; end: string; title: string; allDay: boolean };

type Ev = {
  uid: string;
  summary: string;
  start: string; // "AAAAMMDDTHHMMSS" no horário de Brasília (ou "AAAAMMDD" se o dia todo)
  end: string;
  allDay: boolean;
  rrule: Record<string, string> | null;
  exdates: Set<string>;
  recurrenceId: string | null;
  cancelled: boolean;
};

/**
 * Diferença do fuso do TZID para UTC, em horas. Os do tribunal (SA Eastern,
 * E. South America, Fortaleza/São Paulo, "Brasilia") e os desconhecidos = −3;
 * UTC/GMT = 0; "(UTC-05:00) …" pelo número. (Sem horário de verão: o Brasil não tem mais.)
 */
function tzOffset(params: string): number {
  const tz = (params.match(/TZID=("[^"]*"|[^;:]*)/i)?.[1] ?? "").replace(/"/g, "");
  if (!tz) return -3;
  const num = tz.match(/(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i);
  if (num) return (num[1] === "-" ? -1 : 1) * (Number(num[2]) + Number(num[3] || 0) / 60);
  if (/^(UTC|GMT|Etc\/UTC|Etc\/GMT|Z|Coordinated Universal Time|Greenwich Standard Time)$/i.test(tz.trim())) return 0;
  return -3;
}

/** Data/hora do .ics → horário de Brasília ("AAAAMMDDTHHMMSS"). */
function toBrt(params: string, value: string): string {
  const v = value.trim();
  if (/^\d{8}$/.test(v)) return v;
  const off = v.endsWith("Z") ? 0 : tzOffset(params);
  if (off === -3) return v.slice(0, 15);
  const utc = Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(9, 11), +v.slice(11, 13), +v.slice(13, 15)) - off * 3600_000;
  return new Date(utc - 3 * 3600_000).toISOString().replace(/[-:]/g, "").slice(0, 15);
}

const unescape = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

export function parseIcs(text: string): Ev[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: Ev[] = [];
  let cur: Ev | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { uid: "", summary: "", start: "", end: "", allDay: false, rrule: null, exdates: new Set(), recurrenceId: null, cancelled: false };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur?.start) out.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    // Parâmetros podem vir entre aspas com ":" dentro (TZID="(UTC-03:00) Brasília").
    const m = line.match(/^([A-Z-]+)((?:;(?:"[^"]*"|[^:;"])*)*):(.*)$/);
    if (!m) continue;
    const [, name, params, value] = m;
    if (name === "UID") cur.uid = value;
    else if (name === "SUMMARY") cur.summary = unescape(value);
    else if (name === "DTSTART") {
      cur.start = toBrt(params, value);
      cur.allDay = /^\d{8}$/.test(value.trim());
    } else if (name === "DTEND") cur.end = toBrt(params, value);
    else if (name === "RRULE") cur.rrule = Object.fromEntries(value.split(";").map((p) => p.split("=") as [string, string]));
    else if (name === "EXDATE") for (const v of value.split(",")) cur.exdates.add(toBrt(params, v));
    else if (name === "RECURRENCE-ID") cur.recurrenceId = toBrt(params, value);
    else if (name === "STATUS" && value === "CANCELLED") cur.cancelled = true;
  }
  for (const e of out) if (/^(cancelad[oa]|canceled|cancelled)\s*:/i.test(e.summary)) e.cancelled = true;
  return out;
}

const ymd = (s: string) => s.slice(0, 8);
const dayNum = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / DAY;
const hm = (s: string) => (s.length >= 13 ? `${s.slice(9, 11)}:${s.slice(11, 13)}` : "");
const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * Regra do mês: "2ª terça" (BYDAY=2TU ou BYDAY=TU;BYSETPOS=2), "última sexta"
 * (-1FR), dia fixo (BYMONTHDAY=15 / −1 = último) ou, sem nada, o mesmo dia do 1º.
 */
function monthlyHit(b: Date, first: Date, byDayRaw: string[] | null, byMonthDay: number[] | null, bySetPos: number[] | null): boolean {
  const y = b.getUTCFullYear(), mo = b.getUTCMonth(), dom = b.getUTCDate(), dow = b.getUTCDay();
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  if (byMonthDay) return byMonthDay.some((n) => (n > 0 ? n : last + 1 + n) === dom);
  if (!byDayRaw) return dom === first.getUTCDate();
  const tokens = byDayRaw.map((t) => ({ n: Number(t.match(/^[+-]?\d+/)?.[0] || 0), wd: WD.indexOf(t.replace(/^[+-]?\d+/, "")) }));
  const casa = tokens.filter((t) => t.wd === dow);
  if (!casa.length) return false;
  const nth = Math.ceil(dom / 7), nthFromEnd = -Math.ceil((last - dom + 1) / 7);
  if (casa.some((t) => t.n !== 0 && (t.n === nth || t.n === nthFromEnd))) return true;
  if (!casa.some((t) => t.n === 0)) return false;
  if (!bySetPos) return true;
  // Todos os dias do mês que casam com os BYDAY sem número, em ordem; BYSETPOS escolhe a posição.
  const wds = new Set(tokens.filter((t) => t.n === 0).map((t) => t.wd));
  const dias: number[] = [];
  for (let i = 1; i <= last; i++) if (wds.has(new Date(Date.UTC(y, mo, i)).getUTCDay())) dias.push(i);
  return bySetPos.some((p) => dias[p > 0 ? p - 1 : dias.length + p] === dom);
}

/** O evento repetido cai neste dia? (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY, BYMONTHDAY, BYSETPOS, UNTIL, COUNT) */
function recursOn(e: Ev, day: string): boolean {
  const r = e.rrule!;
  const first = dayNum(e.start), target = dayNum(day);
  if (target < first) return false;
  const until = r.UNTIL ? dayNum(toBrt("", r.UNTIL)) : Infinity;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const byDayRaw = r.BYDAY ? r.BYDAY.split(",") : null;
  const byDay = byDayRaw ? byDayRaw.map((d) => d.replace(/^[+-]?\d+/, "")) : null;
  const byMonthDay = r.BYMONTHDAY ? r.BYMONTHDAY.split(",").map(Number) : null;
  const bySetPos = r.BYSETPOS ? r.BYSETPOS.split(",").map(Number) : null;
  const startDow = new Date(first * DAY).getUTCDay();
  let n = 0;
  for (let d = first; d <= Math.min(target, until); d++) {
    const dow = new Date(d * DAY).getUTCDay();
    let hit = false;
    if (r.FREQ === "DAILY") hit = (d - first) % interval === 0 && (!byDay || byDay.includes(WD[dow]));
    else if (r.FREQ === "WEEKLY") {
      const week = Math.floor((d - first + startDow) / 7); // semanas contadas a partir da do 1º dia
      hit = week % interval === 0 && (byDay ? byDay.includes(WD[dow]) : dow === startDow);
    } else if (r.FREQ === "MONTHLY" || r.FREQ === "YEARLY") {
      const a = new Date(first * DAY), b = new Date(d * DAY);
      const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
      const periodo = r.FREQ === "YEARLY" ? months % 12 === 0 && (months / 12) % interval === 0 : months % interval === 0;
      hit = periodo && monthlyHit(b, a, byDayRaw, byMonthDay, bySetPos);
    }
    if (hit && ++n > count) return false;
    if (hit && d === target) return true;
  }
  return false;
}

/** Reuniões de um dia ("AAAA-MM-DD", horário de Brasília), em ordem de hora. */
export function meetingsOn(events: Ev[], dayIso: string): Meeting[] {
  const day = dayIso.replace(/-/g, "");
  const moved = new Set(events.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${e.recurrenceId}`));
  const list: Meeting[] = [];
  for (const e of events) {
    if (e.cancelled) continue;
    let startOn = "";
    if (e.rrule && !e.recurrenceId) {
      if (!recursOn(e, day)) continue;
      startOn = day + e.start.slice(8);
      if (e.exdates.has(startOn) || moved.has(`${e.uid}|${startOn}`)) continue;
    } else {
      if (ymd(e.start) !== day) continue;
      startOn = e.start;
    }
    list.push({ start: e.allDay ? "" : hm(startOn), end: e.allDay ? "" : hm(e.end), title: e.summary.slice(0, 120) || "(sem título)", allDay: e.allDay });
  }
  // Um evento remarcado e cancelado aparece como exceção cancelada: já saiu acima.
  return list.sort((a, b) => a.start.localeCompare(b.start));
}

let cache: { at: number; url: string; events: Ev[] } | null = null;
let falhouEm = 0; // Outlook fora do ar: só tenta de novo depois de 5 min (o agendador roda todo minuto)

type Cfg = { url?: string; ignorar?: string[] };
async function cfg(): Promise<Cfg> {
  const r = await prisma.flowState.findUnique({ where: { key: KEY } });
  return (r?.value as Cfg | null) ?? {};
}
async function saveCfg(c: Cfg): Promise<void> {
  const value = { url: c.url ?? "", ignorar: c.ignorar ?? [] };
  await prisma.flowState.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

export async function outlookUrl(): Promise<string | null> {
  const url = (await cfg()).url;
  return typeof url === "string" && url ? url : null;
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Eventos do calendário (guardados por 15 min). Se o Outlook não responder, usa a última cópia. null = sem link. */
async function loadEvents(): Promise<Ev[] | null> {
  const url = await outlookUrl();
  if (!url) return null;
  if (cache && cache.url === url && Date.now() - cache.at < CACHE_MS) return cache.events;
  if (Date.now() - falhouEm < 5 * 60_000) {
    if (cache && cache.url === url) return cache.events;
    throw new Error("Outlook falhou há pouco");
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: "text/calendar" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("resposta não é calendário");
    cache = { at: Date.now(), url, events: parseIcs(text) };
    falhouEm = 0;
  } catch (e) {
    falhouEm = Date.now();
    console.error("[outlook] não leu a agenda:", e instanceof Error ? e.message : e);
    if (!cache || cache.url !== url) throw e;
  }
  return cache.events;
}

const brtIso = (offsetDays = 0) => new Date(Date.now() - 3 * 3600_000 + offsetDays * DAY).toISOString().slice(0, 10);

/** Reuniões de hoje (+offset dias). null = sem link configurado ou falha sem cópia. */
export async function outlookMeetings(offsetDays = 0): Promise<Meeting[] | null> {
  try {
    const ev = await loadEvents();
    if (!ev) return null;
    // Reuniões que ele mandou esconder ("ignorar reunião daily"): pelo trecho do título.
    const fora = ((await cfg()).ignorar ?? []).map(semAcento).filter(Boolean);
    return meetingsOn(ev, brtIso(offsetDays)).filter((m) => !fora.some((f) => semAcento(m.title).includes(f)));
  } catch {
    return null;
  }
}

/** Linha para o briefing do WhatsApp ("" se nada). */
export function meetingsText(list: Meeting[]): string {
  return list.map((m) => `• ${m.allDay ? "dia todo" : m.start + (m.end ? `–${m.end}` : "")} ${m.title}`).join("\n");
}

/** Para a Alexa: "às 14 horas, Daily…; às 14 e 30, Redmine…". */
export function meetingsSpeech(list: Meeting[]): string {
  const hora = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return `às ${h}${m ? ` e ${m}` : " horas"}`;
  };
  return list
    .slice(0, 4)
    .map((m) => `${m.allDay ? "o dia todo" : hora(m.start)}, ${m.title.replace(/[*_#|]/g, " ").replace(/\s+/g, " ").slice(0, 70)}`)
    .join("; ");
}

/** "reuniões", "reuniões amanhã", "agenda do outlook <link>", "tirar agenda do outlook", "ignorar reunião daily", "voltar reunião daily". */
export async function applyOutlookCommand(text: string): Promise<string | null> {
  const t = text.trim();
  const link = t.match(/^agenda\s+do\s+outlook\s+(https:\/\/outlook\.office365\.com\/owa\/calendar\/\S+\.ics)\s*$/i);
  if (link) {
    await saveCfg({ ...(await cfg()), url: link[1] });
    cache = null;
    const hoje = await outlookMeetings();
    return hoje === null ? "⚠️ Guardei o link, mas não consegui ler a agenda agora. Confira se ele termina em .ics." : `📅 Agenda do Outlook ligada. Hoje: ${hoje.length ? `\n${meetingsText(hoje)}` : "nenhuma reunião."}`;
  }
  if (/^(tira|tirar|remove|remover|desliga|desligar)\s+(a\s+)?agenda\s+do\s+outlook\s*[.!]*$/i.test(t)) {
    await prisma.flowState.deleteMany({ where: { key: KEY } });
    cache = null;
    return "📅 Agenda do Outlook desligada.";
  }
  // Só "ignorar/esconder" e "voltar": "tira/mostra a reunião de amanhã" é outra coisa.
  const ign = t.match(/^(ignorar|ignora|esconder|esconde)\s+(?:a\s+)?reuni[aã]o\s+(?:da\s+|do\s+|de\s+)?(.{3,60}?)\s*[.!]*$/i);
  const vol = t.match(/^(voltar|volta)\s+(?:a\s+)?reuni[aã]o\s+(?:da\s+|do\s+|de\s+)?(.{3,60}?)\s*[.!]*$/i);
  const termoOk = (x: string) => !/^(hoje|amanh[aã]|de hoje|de amanh[aã])$/i.test(x.trim()) && !/\bagenda\b/i.test(x);
  if ((ign || vol) && termoOk((ign ?? vol)![2])) {
    const c = await cfg();
    const termo = semAcento((ign ?? vol)![2]);
    const lista = (c.ignorar ?? []).filter((x) => x !== termo);
    if (ign) lista.push(termo);
    await saveCfg({ ...c, ignorar: lista });
    return ign
      ? `🙈 Reuniões com "${termo}" no título não aparecem mais no briefing, na Alexa nem em *reuniões*. Para voltar: *voltar reunião ${termo}*.`
      : `👀 Reuniões com "${termo}" voltam a aparecer.`;
  }
  const q = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const m = q.match(/^(?:(?:quais|mostra|mostrar|ver|tenho)\s+(?:sao\s+)?(?:as?\s+)?(?:minhas?\s+)?|minhas?\s+)?reunio(?:es|ao)(?:\s+(?:de\s+)?(hoje|amanha))?\s*\??$/);
  if (!m) return null;
  const amanha = m[1] === "amanha";
  const list = await outlookMeetings(amanha ? 1 : 0);
  if (list === null) return (await outlookUrl()) ? "⚠️ Não consegui ler a agenda do Outlook agora. Tente de novo daqui a pouco." : "📅 A agenda do Outlook não está ligada. Mande: *agenda do outlook* + o link .ics.";
  const quando = amanha ? "amanhã" : "hoje";
  return list.length ? `📅 *Reuniões ${quando}:*\n${meetingsText(list)}` : `📅 Nenhuma reunião ${quando} no Outlook.`;
}
