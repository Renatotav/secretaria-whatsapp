// Strava (24/11/2026, pedido dele: relógio Amazfit GTS 2 → Zepp → Strava → secretária).
// O app do Strava é dele (Client ID/Secret colados no painel); a chave se renova sozinha.
// As atividades viram cardio no Corpo (tempo, km, calorias) e contam como dia ativo.
// Tudo fica no FlowState "strava" (fora do repo e sem coluna nova).

import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

const KEY = "strava";
const DIA = 86_400_000;
type Cfg = {
  clientId?: string;
  clientSecret?: string;
  access?: string;
  refresh?: string;
  expiresAt?: number; // segundos (como o Strava manda)
  state?: string;
  atleta?: string;
  ultimaSync?: number; // ms
  ultimaAtividade?: number; // segundos (start_date) da mais nova já importada
  erro?: string;
};

async function cfg(): Promise<Cfg> {
  const r = await prisma.flowState.findUnique({ where: { key: KEY } });
  return (r?.value as Cfg) ?? {};
}
async function save(c: Cfg): Promise<void> {
  const value = JSON.parse(JSON.stringify(c));
  await prisma.flowState.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

/** O que o painel mostra (sem as chaves). */
export async function stravaStatus() {
  const c = await cfg();
  return { configurado: !!(c.clientId && c.clientSecret), autorizado: !!c.refresh, atleta: c.atleta ?? null, ultimaSync: c.ultimaSync ?? null, erro: c.erro ?? null };
}

/** Client ID e Secret do app que ele criou em strava.com/settings/api. */
export async function stravaSalvarApp(clientId: string, clientSecret: string): Promise<string | null> {
  if (!/^\d{3,10}$/.test(clientId.trim())) return "O Client ID do Strava é só número (ex.: 123456).";
  if (!/^[0-9a-f]{40}$/i.test(clientSecret.trim())) return "O Client Secret tem 40 letras e números. Copie de novo em strava.com/settings/api.";
  const c = await cfg();
  await save({ ...c, clientId: clientId.trim(), clientSecret: clientSecret.trim(), access: undefined, refresh: undefined, erro: undefined });
  return null;
}

/** Passo 1: o link de autorização do Strava (só leitura das atividades). */
export async function stravaStart(origin: string): Promise<{ url: string } | { error: string }> {
  const c = await cfg();
  if (!c.clientId) return { error: "Cole antes o Client ID e o Client Secret." };
  c.state = `${Date.now().toString(36)}.${randomBytes(24).toString("hex")}`;
  await save(c);
  const q = new URLSearchParams({ client_id: c.clientId, response_type: "code", redirect_uri: `${origin}/api/strava/oauth`, approval_prompt: "auto", scope: "read,activity:read_all", state: c.state });
  return { url: `https://www.strava.com/oauth/authorize?${q}` };
}

/** Passo 2: o Strava volta com o código; troca pela chave que se renova (state de uso único, 15 min). */
export async function stravaFinish(code: string, state: string): Promise<boolean> {
  const c = await cfg();
  const s = c.state;
  if (!s || !state || state.length !== s.length || !timingSafeEqual(Buffer.from(state), Buffer.from(s))) return false;
  if (Date.now() - parseInt(s.split(".")[0], 36) > 15 * 60_000) return false;
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, code, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) return false;
  const j = (await r.json()) as { access_token: string; refresh_token: string; expires_at: number; athlete?: { firstname?: string } };
  await save({ ...c, state: undefined, access: j.access_token, refresh: j.refresh_token, expiresAt: j.expires_at, atleta: j.athlete?.firstname, erro: undefined });
  return true;
}

/** Chave válida (renova se faltar menos de 5 min). */
async function token(c: Cfg): Promise<string | null> {
  if (!c.refresh) return null;
  if (c.access && c.expiresAt && c.expiresAt * 1000 - Date.now() > 5 * 60_000) return c.access;
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refresh, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    c.erro = `O Strava recusou renovar a chave (HTTP ${r.status}). Autorize de novo na aba Corpo.`;
    await save(c);
    return null;
  }
  const j = (await r.json()) as { access_token: string; refresh_token: string; expires_at: number };
  Object.assign(c, { access: j.access_token, refresh: j.refresh_token, expiresAt: j.expires_at, erro: undefined });
  await save(c);
  return c.access!;
}

// Tipo do Strava → nome em português e MET (para quando a atividade não traz calorias).
const TIPOS: Record<string, [string, number]> = {
  Run: ["corrida", 9.8], TrailRun: ["corrida", 9.8], VirtualRun: ["esteira", 8],
  Walk: ["caminhada", 3.5], Hike: ["trilha", 6],
  Ride: ["bike", 7.5], VirtualRide: ["bike ergométrica", 6.8], EBikeRide: ["bike elétrica", 4], MountainBikeRide: ["bike", 8.5],
  Swim: ["natação", 8], Elliptical: ["elíptico", 5], StairStepper: ["escada", 8],
  WeightTraining: ["musculação", 5], Workout: ["treino", 5], Crossfit: ["crossfit", 8], HighIntensityIntervalTraining: ["HIIT", 8], Yoga: ["yoga", 2.5],
};
export const nomeTipo = (t: string) => TIPOS[t]?.[0] ?? t.toLowerCase();

type Atividade = { id: number; sport_type?: string; type?: string; moving_time: number; distance: number; start_date: string; start_date_local: string; calories?: number; kilojoules?: number; average_heartrate?: number };

/**
 * Traz as atividades novas (desde a última, ou 30 dias na primeira vez). Devolve as importadas.
 * Não duplica: o id do Strava fica na nota do registro.
 */
export async function stravaSync(): Promise<{ novas: { atividade: string; min: number; km: number | null; kcal: number }[]; erro?: string }> {
  const c = await cfg();
  const tk = await token(c);
  if (!tk) return { novas: [], erro: c.erro ?? (c.clientId ? "Falta autorizar no Strava (aba Corpo)." : "Strava não configurado.") };
  const desde = c.ultimaAtividade ?? Math.floor((Date.now() - 30 * DIA) / 1000);
  const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${desde}&per_page=50`, { headers: { Authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) return { novas: [], erro: `O Strava não respondeu (HTTP ${r.status}).` };
  const lista = ((await r.json()) as Atividade[]).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const ultPeso = (await prisma.corpoLog.findFirst({ where: { kind: "peso", value: { not: null } }, orderBy: { at: "desc" } }))?.value ?? 80;
  const novas: { atividade: string; min: number; km: number | null; kcal: number }[] = [];
  for (const a of lista) {
    if (await prisma.corpoLog.findFirst({ where: { kind: "cardio", note: { contains: `"strava":${a.id},` } } })) continue;
    // O detalhe traz as calorias que o relógio calculou (a lista não traz).
    const det = await fetch(`https://www.strava.com/api/v3/activities/${a.id}`, { headers: { Authorization: `Bearer ${tk}` }, signal: AbortSignal.timeout(20_000) }).then((x) => (x.ok ? (x.json() as Promise<Atividade>) : null)).catch(() => null);
    const tipo = a.sport_type ?? a.type ?? "Workout";
    const min = Math.round(a.moving_time / 60);
    const met = TIPOS[tipo]?.[1] ?? 5;
    const kcal = Math.round(det?.calories || (a.kilojoules ? a.kilojoules * 0.239 * 4 : 0) || (met * ultPeso * min) / 60);
    const km = a.distance > 50 ? Math.round(a.distance / 100) / 10 : null;
    const dia = a.start_date_local.slice(0, 10);
    const at = new Date(`${dia}T12:00:00`);
    await prisma.corpoLog.create({ data: { kind: "cardio", value: kcal, at, note: JSON.stringify({ strava: a.id, atividade: nomeTipo(tipo), min, km, fc: a.average_heartrate ?? null }) } });
    const ja = await prisma.corpoLog.findFirst({ where: { kind: "academia", at: { gte: new Date(at.getTime() - DIA / 2), lt: new Date(at.getTime() + DIA / 2) } } });
    if (!ja) await prisma.corpoLog.create({ data: { kind: "academia", at, note: "strava" } });
    novas.push({ atividade: nomeTipo(tipo), min, km, kcal });
    c.ultimaAtividade = Math.max(c.ultimaAtividade ?? 0, Math.floor(new Date(a.start_date).getTime() / 1000));
  }
  c.ultimaSync = Date.now();
  await save(c);
  return { novas };
}

/** "strava" / "sincroniza o strava" no WhatsApp. */
export async function applyStravaCommand(text: string): Promise<string | null> {
  if (!/^\s*(?:sincroniza(?:r)?\s+(?:o\s+)?|atualiza(?:r)?\s+(?:o\s+)?)?(strava|rel[oó]gio)\s*\??\s*$/i.test(text)) return null;
  const r = await stravaSync();
  if (r.erro) return `⌚ ${r.erro}`;
  if (!r.novas.length) return "⌚ Strava conferido: nenhuma atividade nova.";
  return `⌚ Do Strava:\n${r.novas.map((a) => `• ${a.atividade}: ${a.min} min${a.km ? ` · ${a.km.toLocaleString("pt-BR")} km` : ""} · ~${a.kcal.toLocaleString("pt-BR")} kcal`).join("\n")}`;
}
