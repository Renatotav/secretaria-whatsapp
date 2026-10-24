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

/** Data/hora do .ics → horário de Brasília ("AAAAMMDDTHHMMSS"). Com TZID é a hora local do tribunal (UTC−3). */
function toBrt(params: string, value: string): string {
  const v = value.trim();
  if (/^\d{8}$/.test(v)) return v;
  if (v.endsWith("Z")) {
    const d = new Date(Date.UTC(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8), +v.slice(9, 11), +v.slice(11, 13), +v.slice(13, 15)) - 3 * 3600_000);
    return d.toISOString().replace(/[-:]/g, "").slice(0, 15);
  }
  void params;
  return v.slice(0, 15);
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
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
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

/** O evento repetido cai neste dia? (DAILY/WEEKLY/MONTHLY, INTERVAL, BYDAY, UNTIL, COUNT) */
function recursOn(e: Ev, day: string): boolean {
  const r = e.rrule!;
  const first = dayNum(e.start), target = dayNum(day);
  if (target < first) return false;
  const until = r.UNTIL ? dayNum(toBrt("", r.UNTIL)) : Infinity;
  const interval = Math.max(1, Number(r.INTERVAL) || 1);
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const byDay = r.BYDAY ? r.BYDAY.split(",").map((d) => d.replace(/^[+-]?\d+/, "")) : null;
  const startDow = new Date(first * DAY).getUTCDay();
  let n = 0;
  for (let d = first; d <= Math.min(target, until); d++) {
    const dow = new Date(d * DAY).getUTCDay();
    let hit = false;
    if (r.FREQ === "DAILY") hit = (d - first) % interval === 0 && (!byDay || byDay.includes(WD[dow]));
    else if (r.FREQ === "WEEKLY") {
      const week = Math.floor((d - first + startDow) / 7); // semanas contadas a partir da do 1º dia
      hit = week % interval === 0 && (byDay ? byDay.includes(WD[dow]) : dow === startDow);
    } else if (r.FREQ === "MONTHLY") {
      const a = new Date(first * DAY), b = new Date(d * DAY);
      const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
      hit = months % interval === 0 && b.getUTCDate() === a.getUTCDate();
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
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { accept: "text/calendar" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("resposta não é calendário");
    cache = { at: Date.now(), url, events: parseIcs(text) };
  } catch (e) {
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
  const ign = t.match(/^(ignorar|ignora|esconder|esconde|tirar|tira)\s+(?:a\s+)?reuni[aã]o\s+(?:da\s+|do\s+|de\s+)?(.{3,60}?)\s*[.!]*$/i);
  const vol = t.match(/^(voltar|volta|mostrar|mostra)\s+(?:a\s+)?reuni[aã]o\s+(?:da\s+|do\s+|de\s+)?(.{3,60}?)\s*[.!]*$/i);
  if (ign || vol) {
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
  const m = q.match(/^(?:quais\s+(?:sao\s+)?(?:as\s+)?(?:minhas\s+)?|minhas\s+)?reunio(?:es|ao)(?:\s+(?:de\s+)?(hoje|amanha))?\s*\??$/);
  if (!m) return null;
  const amanha = m[1] === "amanha";
  const list = await outlookMeetings(amanha ? 1 : 0);
  if (list === null) return (await outlookUrl()) ? "⚠️ Não consegui ler a agenda do Outlook agora. Tente de novo daqui a pouco." : "📅 A agenda do Outlook não está ligada. Mande: *agenda do outlook* + o link .ics.";
  const quando = amanha ? "amanhã" : "hoje";
  return list.length ? `📅 *Reuniões ${quando}:*\n${meetingsText(list)}` : `📅 Nenhuma reunião ${quando} no Outlook.`;
}
