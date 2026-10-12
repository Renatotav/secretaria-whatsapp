import { prisma } from "./prisma";

// Diário da scooter (ANGIE AG11-4, LiFePO4 76,8 V / 30 Ah / 2304 Wh). O dono
// manda pelo WhatsApp a leitura do painel e a energia de cada carga (tomada
// Tapo); daqui sai o consumo real e quando recarregar com folga. Regra fixa,
// sem IA. Objetivo dele: nunca mais ficar sem bateria e empurrar a scooter.
//
//   "scooter 52 km 79v 6 barras"   → leitura do painel
//   "carreguei 1,8 kWh"             → carga (até o verde), com ou sem "com 52 km"
//   "scooter?" / "autonomia"        → situação
//   "calibrei o pneu 34 36"         → calibragem (aviso a cada 7 dias)

const BATTERY_WH = 2304;
/** Energia que dá para usar com segurança (o BMS corta antes do zero). */
const USABLE = 0.85;
/** Perda do carregador: a tomada mede mais do que entra na bateria. */
const CHARGER_EFF = 0.88;
/** Antes de ter dados: a estimativa dele (anunciado 60 km, ele acha ~45). */
const DEFAULT_RANGE_KM = 45;
/** Recarregar ao chegar nesta fração da autonomia estimada. */
const SAFE_FRACTION = 0.7;
/** Calibrar os pneus de quanto em quanto tempo (pedido dele). */
const TIRE_DAYS = 7;

const NUM = "(\\d+(?:[.,]\\d+)?)";
const num = (s: string) => Number(s.replace(",", "."));
const fmt = (n: number, d = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: 0 });

// Fala de dinheiro é do financeiro ("paguei 120 no pneu da scooter").
const MONEY_RE = /r\$|\breais\b|\b(comprei|paguei|gastei|custou|pix)\b/i;
const VEHICLE_RE = /\b(scooter|moto|patinete|odo|od[oô]metro)\b/i;
const READING_START_RE = /^\s*(?:a\s+)?(?:scooter|moto|odo|od[oô]metro)\b/i;
const CHARGE_RE = /\b(carreguei|recarreguei|carga|carregou|carregando)\b/i;
const STATUS_RE = /^\s*(?:(?:como\s+(?:est[aá]|t[aá])\s+(?:a\s+)?)?(?:scooter|moto)|autonomia(?:\s+da\s+(?:scooter|moto))?|quanto\s+(?:ainda\s+)?(?:d[aá]|tenho)\s+(?:pra|para)\s+rodar)\s*\??\s*$/i;

function readingFrom(text: string) {
  const km = text.match(new RegExp(`${NUM}\\s*km\\b`, "i")) ?? text.match(new RegExp(`\\bodo(?:metro)?\\s*:?\\s*${NUM}`, "i"));
  const volts = text.match(new RegExp(`${NUM}\\s*v\\b`, "i"));
  const bars = text.match(/\b([0-6])\s*(?:\/\s*6|barras?|pauzinhos?|tracinhos?)\b/i);
  return {
    odo: km ? num(km[1]) : null,
    volts: volts && num(volts[1]) >= 50 && num(volts[1]) <= 95 ? num(volts[1]) : null,
    bars: bars ? Number(bars[1]) : null,
  };
}

/** Comando da scooter, ou null se a mensagem não é sobre ela. */
export async function applyScooterCommand(text: string): Promise<string | null> {
  const t = text.trim();
  if (!t || t.length > 200 || MONEY_RE.test(t)) return null;

  if (STATUS_RE.test(t)) return scooterStatus();

  // "calibrei o pneu 34 36" / "calibrei os pneus" (dianteiro, traseiro).
  if (/\bcalibr(?:ei|ado|ados|ou|ar)\b/i.test(t) && /\bpneus?\b/i.test(t)) {
    const psi = [...t.matchAll(/\b(\d{2})(?:[.,]\d)?\s*(?:psi|lb|libras)?\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 20 && n <= 50);
    const last = await prisma.scooterLog.findFirst({ where: { kind: "pneu" }, orderBy: { at: "desc" } });
    // Sem números ("calibrei os pneus"): repete a pressão da última vez.
    const front = psi[0] ?? last?.psiFront ?? null;
    const rear = psi[1] ?? psi[0] ?? last?.psiRear ?? null;
    await prisma.scooterLog.create({ data: { kind: "pneu", psiFront: front, psiRear: rear, note: t.slice(0, 200) } });
    const when = new Date(Date.now() + TIRE_DAYS * 86_400_000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    return `🛞 Calibragem anotada${front != null ? `: ${fmt(front)} PSI dianteiro / ${fmt(rear ?? front)} PSI traseiro` : ""}. Te lembro de calibrar de novo em ${when}.`;
  }

  // "scooter desfazer": apaga o último registro. "scooter corrigir 43 km": troca o ODO dele.
  if (/^\s*(?:scooter|moto)\s+(?:desfazer|apagar\s+(?:o\s+)?[uú]ltimo)\s*$/i.test(t)) {
    const last = await prisma.scooterLog.findFirst({ orderBy: { at: "desc" } });
    if (!last) return "🛵 Não há registro da scooter para desfazer.";
    await prisma.scooterLog.delete({ where: { id: last.id } });
    return `↩️ Apaguei o último registro da scooter (${last.kind === "carga" ? "carga" : last.kind === "pneu" ? "calibragem" : "leitura"} de ${last.at.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}).`;
  }
  const fix = t.match(new RegExp(`^\\s*(?:scooter|moto)\\s+corrigir\\s+${NUM}\\s*km\\s*$`, "i"));
  if (fix) {
    const last = await prisma.scooterLog.findFirst({ where: { odo: { not: null } }, orderBy: { at: "desc" } });
    if (!last) return "🛵 Não há leitura com ODO para corrigir.";
    await prisma.scooterLog.update({ where: { id: last.id }, data: { odo: num(fix[1]) } });
    return `✏️ Corrigido: o último ODO agora é ${fmt(num(fix[1]), 1)} km.\n\n${await scooterStatus(true)}`;
  }

  const kwh = t.match(new RegExp(`${NUM}\\s*kwh\\b`, "i"));
  if (kwh || (CHARGE_RE.test(t) && VEHICLE_RE.test(t))) {
    const r = readingFrom(t.replace(new RegExp(`${NUM}\\s*kwh\\b`, "i"), " "));
    const hours = t.match(new RegExp(`${NUM}\\s*(?:h\\b|horas?)`, "i"));
    const energy = kwh ? num(kwh[1]) : null;
    if (energy !== null && (energy <= 0 || energy > 4)) return "🛵 Esse valor de kWh parece errado (uma carga cheia fica perto de 2,6 kWh na tomada). Manda de novo, ex: *carreguei 1,8 kWh*.";
    return recordCharge({ kwh: energy, odo: r.odo, hours: hours ? num(hours[1]) : null, note: t.slice(0, 200) });
  }

  if (READING_START_RE.test(t)) {
    const r = readingFrom(t);
    if (r.odo === null && r.volts === null && r.bars === null) return null;
    const prev = await lastOdo();
    if (r.odo !== null && prev !== null && r.odo < prev) {
      return `🛵 O ODO ${fmt(r.odo, 1)} km é menor que o último que você mandou (${fmt(prev, 1)} km). Confere o número? Se o anterior estava errado, responda *scooter corrigir ${fmt(r.odo, 1)} km*.`;
    }
    await prisma.scooterLog.create({ data: { kind: "leitura", odo: r.odo, volts: r.volts, bars: r.bars, note: t.slice(0, 200) } });
    const parts = [r.odo !== null && `${fmt(r.odo, 1)} km`, r.volts !== null && `${fmt(r.volts, 1)} V`, r.bars !== null && `${r.bars}/6 barras`].filter(Boolean);
    return `🛵 Anotado: ${parts.join(" · ")}.\n\n${await scooterStatus(true)}`;
  }

  return null;
}

/**
 * Grava uma carga. Se já há uma carga nas últimas 12 h (ex: a tomada mandou o
 * kWh e depois ele digitou o ODO, ou o contrário), completa essa em vez de
 * criar outra — assim não conta a mesma carga duas vezes.
 */
export async function recordCharge(c: { kwh: number | null; odo?: number | null; hours?: number | null; note: string; at?: Date }): Promise<string> {
  const recent = await prisma.scooterLog.findFirst({ where: { kind: "carga", at: { gte: new Date(Date.now() - 12 * 3_600_000) } }, orderBy: { at: "desc" } });
  let odo = c.odo ?? null;
  let usedLast = false;
  if (odo === null && !recent?.odo) {
    odo = await lastOdo();
    usedLast = odo !== null;
  }
  const saved = recent
    ? await prisma.scooterLog.update({
        where: { id: recent.id },
        data: {
          kwh: c.kwh ?? recent.kwh,
          odo: c.odo ?? recent.odo ?? odo,
          hours: c.hours ?? recent.hours,
          note: `${recent.note} | ${c.note}`.slice(0, 400),
        },
      })
    : await prisma.scooterLog.create({ data: { kind: "carga", at: c.at ?? new Date(), odo, kwh: c.kwh, hours: c.hours ?? null, note: c.note } });
  const head = `🔌 Carga ${recent ? "atualizada" : "anotada"}${saved.kwh != null ? `: ${fmt(saved.kwh, 2)} kWh` : ""}${saved.hours != null ? ` em ${fmt(saved.hours, 1)} h` : ""}${saved.odo != null ? ` com ${fmt(saved.odo, 1)} km` : ""}.`;
  const tips = [
    saved.kwh == null && "💡 Quando puder, manda o kWh que a tomada mostrou (ex: *carreguei 1,8 kWh*) — é com ele que eu calculo o consumo real.",
    saved.odo == null && "💡 Me manda o ODO de agora (ex: *scooter 43 km*) para eu contar os km desde esta carga.",
    usedLast && `💡 Usei o último ODO que você mandou (${fmt(odo!, 1)} km). Se rodou depois disso, responda *scooter corrigir X km*.`,
  ].filter(Boolean);
  return `${head}${tips.length ? `\n${tips.join("\n")}` : ""}\n\n${await scooterStatus(true)}`;
}

async function lastOdo(): Promise<number | null> {
  const l = await prisma.scooterLog.findFirst({ where: { odo: { not: null } }, orderBy: { at: "desc" } });
  return l?.odo ?? null;
}

/** Consumo e autonomia com o que já foi registrado. */
export async function scooterNumbers() {
  const logs = await prisma.scooterLog.findMany({ orderBy: { at: "asc" } });
  if (!logs.length) return null;
  const charges = logs.filter((l) => l.kind === "carga");
  // Ciclo = de uma carga (até o verde) à seguinte: a energia da 2ª repõe o que os km gastaram.
  const cycles: { km: number; whKm: number }[] = [];
  for (let i = 1; i < charges.length; i++) {
    const a = charges[i - 1], b = charges[i];
    if (a.odo === null || b.odo === null || b.kwh === null) continue;
    const km = b.odo - a.odo;
    if (km >= 5) cycles.push({ km, whKm: (b.kwh * 1000 * CHARGER_EFF) / km });
  }
  const recent = cycles.slice(-4);
  const whKm = recent.length ? recent.reduce((s, c) => s + c.whKm * c.km, 0) / recent.reduce((s, c) => s + c.km, 0) : null;
  // Nunca acima do anunciado (60 km): melhor errar para menos.
  const rangeKm = whKm ? Math.min(60, (BATTERY_WH * USABLE) / whKm) : DEFAULT_RANGE_KM;
  const safeKm = rangeKm * SAFE_FRACTION;
  const lastCharge = charges.at(-1) ?? null;
  const odoNow = [...logs].reverse().find((l) => l.odo !== null)?.odo ?? null;
  const kmSince = lastCharge?.odo != null && odoNow !== null ? Math.max(0, odoNow - lastCharge.odo) : null;
  const daysSince = lastCharge ? Math.floor((Date.now() - lastCharge.at.getTime()) / 86_400_000) : null;
  const lastReading = [...logs].reverse().find((l) => l.kind === "leitura") ?? null;
  const lastTire = [...logs].reverse().find((l) => l.kind === "pneu") ?? null;
  const tireDays = lastTire ? Math.floor((Date.now() - lastTire.at.getTime()) / 86_400_000) : null;
  return { whKm, rangeKm, safeKm, measured: recent.length, kmSince, daysSince, odoNow, lastCharge, lastReading, lastTire, tireDays };
}

export async function scooterStatus(short = false): Promise<string> {
  const n = await scooterNumbers();
  if (!n) return "🛵 Ainda não tenho registros da scooter. Manda a leitura do painel (ex: *scooter 43 km 79v 6 barras*) e, quando carregar, *carreguei 1,8 kWh*.";
  const lines: string[] = [];
  if (n.kmSince !== null) {
    const left = n.safeKm - n.kmSince;
    const icon = left <= 0 ? "🔴" : left <= 8 ? "🟡" : "🟢";
    lines.push(
      left <= 0
        ? `${icon} *Recarregue hoje*: ${fmt(n.kmSince)} km desde a carga (o seguro é recarregar até ~${fmt(n.safeKm)} km).`
        : `${icon} ${fmt(n.kmSince)} km desde a carga · recarregue até ~${fmt(n.safeKm)} km (folga de ${fmt(left)} km).`
    );
  } else if (!n.lastCharge) {
    lines.push("🔌 Ainda sem carga registrada: na próxima, manda *carreguei X kWh* (com o ODO, se lembrar).");
  }
  if (n.daysSince !== null && n.daysSince >= 7) lines.push(`📅 Faz ${n.daysSince} dias da última carga.`);
  if (n.lastTire) lines.push(tireLine(n.lastTire, n.tireDays ?? 0));
  if (!short) {
    lines.push(
      n.whKm
        ? `⚡ Consumo real: ${fmt(n.whKm, 1)} Wh/km (${n.measured} ciclo(s)) → autonomia estimada ~${fmt(n.rangeKm)} km.`
        : `⚡ Autonomia: usando ~${DEFAULT_RANGE_KM} km (sua estimativa) até ter 2 cargas com kWh e ODO.`
    );
    if (n.lastReading) {
      const r = n.lastReading;
      const bits = [r.odo != null && `${fmt(r.odo, 1)} km`, r.volts != null && `${fmt(r.volts, 1)} V`, r.bars != null && `${r.bars}/6`].filter(Boolean);
      lines.push(`📟 Última leitura: ${bits.join(" · ")} (${r.at.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}).`);
    }
  } else if (!n.whKm) {
    lines.push(`(margem calculada com ~${DEFAULT_RANGE_KM} km de autonomia até eu medir seu consumo real)`);
  }
  return `🛵 *Scooter*\n${lines.join("\n")}`;
}

/** Linha do resumo do dia (só quando já há registros e algo a dizer). */
function tireLine(t: { at: Date; psiFront: number | null; psiRear: number | null }, days: number): string {
  const d = t.at.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const psi = t.psiFront != null ? ` (${fmt(t.psiFront)} diant. / ${fmt(t.psiRear ?? t.psiFront)} tras. PSI)` : "";
  return days >= TIRE_DAYS ? `🛞 *Calibre os pneus*: a última foi em ${d}${psi}, há ${days} dias.` : `🛞 Pneus calibrados em ${d}${psi} · próxima em ${TIRE_DAYS - days} dia(s).`;
}

export async function scooterDigestLine(): Promise<string> {
  const n = await scooterNumbers().catch(() => null);
  if (!n) return "";
  const tireDue = n.lastTire && (n.tireDays ?? 0) >= TIRE_DAYS ? tireLine(n.lastTire, n.tireDays ?? 0) : "";
  if (n.kmSince === null && (n.daysSince ?? 0) < 7) return tireDue;
  const parts: string[] = [];
  if (n.kmSince !== null) {
    const left = n.safeKm - n.kmSince;
    parts.push(left <= 0 ? `🔴 recarregue hoje (${fmt(n.kmSince)} km desde a carga)` : `${left <= 8 ? "🟡" : "🟢"} folga de ~${fmt(left)} km (${fmt(n.kmSince)} km desde a carga)`);
  }
  if (n.daysSince !== null && n.daysSince >= 7) parts.push(`${n.daysSince} dias da última carga`);
  return `🛵 Scooter: ${parts.join(" · ")}${tireDue ? `\n${tireDue}` : ""}`;
}
