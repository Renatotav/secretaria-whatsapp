"use client";

import { useEffect, useState } from "react";
import { useWidth } from "@/lib/use-width";

type Carga = { at: string; kwh: number | null; hours: number | null; odo: number | null; km: number | null; whKm: number | null; custo: number | null; picoW: number | null; auto: boolean };
type Leitura = { at: string; odo: number; volts: number | null; bars: number | null; carga: boolean };
type Dados = {
  empty?: boolean;
  whKm: number | null;
  rangeKm: number;
  safeKm: number;
  measured: number;
  kmSince: number | null;
  daysSince: number | null;
  odoNow: number | null;
  price: number;
  mesKwh: number;
  custoKm: number | null;
  kmDia: number | null;
  tireEvery: number;
  tireDays: number | null;
  cargas: Carga[];
  leituras: Leitura[];
  pneus: { at: string; front: number | null; rear: number | null }[];
};

const n = (v: number, d = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TZ = { timeZone: "America/Sao_Paulo" } as const;
const dia = (s: string) => new Date(s).toLocaleDateString("pt-BR", { ...TZ, day: "2-digit", month: "2-digit" });
const hora = (s: string) => new Date(s).toLocaleTimeString("pt-BR", { ...TZ, hour: "2-digit", minute: "2-digit" }).replace(":", "h");
const duracao = (h: number) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };

/**
 * Painel da scooter: folga até a próxima carga, consumo real e histórico de
 * cargas (a tomada Tapo manda sozinha) e de leituras do ODO (WhatsApp).
 */
export default function ScooterPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    fetch("/api/scooter/painel")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErro(true));
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: 20, maxWidth: 1100, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🛵 Scooter</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            As cargas chegam sozinhas pela tomada. O ODO você manda no WhatsApp (ex.: <em>scooter 70 km</em> ou o vídeo do painel).
          </p>
        </div>

        {erro && <div style={{ color: "var(--danger)" }}>Não consegui carregar. Atualize a página.</div>}
        {!d && !erro && <div style={{ color: "var(--text-muted)" }}>Carregando...</div>}
        {d?.empty && <div style={{ color: "var(--text-muted)" }}>Ainda sem registros. No WhatsApp: <em>scooter 43 km 79v 6 barras</em>.</div>}
        {d && !d.empty && <Painel d={d} />}
      </div>
    </div>
  );
}

function Painel({ d }: { d: Dados }) {
  const folga = d.kmSince != null ? d.safeKm - d.kmSince : null;
  const cor = folga == null ? "var(--text-muted)" : folga <= 0 ? "var(--danger)" : folga <= 8 ? "var(--warning)" : "var(--success)";
  // Bateria estimada: a carga vai até o cheio, então sobra o que os km ainda não gastaram.
  const pct = d.kmSince != null ? Math.max(0, Math.min(1, 1 - d.kmSince / d.rangeKm)) : null;
  const ultima = d.cargas[0];
  const pneu = d.pneus[0];

  return (
    <>
      <div style={{ ...card, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 22, color: cor }}>
            {folga == null ? "Sem carga registrada" : folga <= 0 ? "Recarregue hoje" : `Folga de ~${n(folga)} km`}
          </strong>
          {pct != null && <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{n(pct * 100)}%</span>}
        </div>
        {pct != null && (
          <div style={{ height: 12, borderRadius: 6, background: "var(--bg-hover)", overflow: "hidden" }} title="Bateria estimada pelos km desde a última carga">
            <div style={{ width: `${pct * 100}%`, height: "100%", background: cor, borderRadius: 6 }} />
          </div>
        )}
        <div style={muted}>
          {d.kmSince != null && `${n(d.kmSince)} km desde a carga${ultima ? ` de ${dia(ultima.at)}` : ""} · recarregar até ~${n(d.safeKm)} km`}
          {d.daysSince != null && d.daysSince > 0 && ` · faz ${d.daysSince} dia(s)`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(130px, 100%), 1fr))", gap: 10 }}>
        <Kpi titulo="Consumo médio" valor={d.whKm ? `${n(d.whKm, 1)} Wh/km` : "—"} dica={d.whKm ? `${d.measured} ciclo(s) medido(s)` : "precisa de 2 cargas"} />
        <Kpi titulo="Autonomia" valor={`~${n(d.rangeKm)} km`} dica="bateria cheia até o corte" />
        <Kpi titulo="Média por dia" valor={d.kmDia != null ? `${n(d.kmDia, 1)} km` : "—"} dica={d.kmDia != null ? `≈ ${n(d.kmDia * 7)} km por semana` : "poucos dias ainda"} />
        <Kpi titulo="Custo a cada 100 km" valor={d.custoKm ? brl(d.custoKm * 100) : "—"} dica={`tarifa ${brl(d.price)}/kWh`} />
        <Kpi titulo="Este mês" valor={brl(d.mesKwh * d.price)} dica={`${n(d.mesKwh, 2)} kWh na conta de luz`} />
        <Kpi titulo="ODO" valor={d.odoNow != null ? `${n(d.odoNow)} km` : "—"} dica={d.leituras.length ? `última: ${dia(d.leituras.at(-1)!.at)}` : ""} />
      </div>

      <GraficoKm leituras={d.leituras} media={d.kmDia} />

      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>🔌 Carregamentos</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: 10 }}>
          {d.cargas.map((c) => (
            <div key={c.at} style={{ ...card, display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{dia(c.at)} · {hora(c.at)}</strong>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{c.kwh != null ? `${n(c.kwh, 2)} kWh` : "—"}</strong>
              </div>
              <div style={{ ...muted, display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
                {c.custo != null && <span>💰 {brl(c.custo)}</span>}
                {c.hours != null && <span>⏱️ {duracao(c.hours)}</span>}
                {c.picoW != null && <span>⚡ pico {n(c.picoW)} W</span>}
                {c.odo != null && <span>📟 {n(c.odo)} km</span>}
              </div>
              {c.km != null && (
                <div style={{ fontSize: 13 }}>
                  Repôs {n(c.km)} km rodados{c.whKm ? ` · ${n(c.whKm, 1)} Wh/km` : ""}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.auto ? "registrada pela tomada" : "anotada à mão"}</div>
            </div>
          ))}
        </div>
      </div>

      {pneu && (
        <div style={{ ...card, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span>
            🛞 Pneus calibrados em {dia(pneu.at)}
            {pneu.front != null && ` (${n(pneu.front)} / ${n(pneu.rear ?? pneu.front)} PSI)`}
          </span>
          <span style={{ fontSize: 13, color: (d.tireDays ?? 0) >= d.tireEvery ? "var(--warning)" : "var(--text-muted)" }}>
            {(d.tireDays ?? 0) >= d.tireEvery ? `calibrar: faz ${d.tireDays} dias` : `próxima em ${d.tireEvery - (d.tireDays ?? 0)} dia(s)`}
          </span>
        </div>
      )}
    </>
  );
}

function Kpi({ titulo, valor, dica }: { titulo: string; valor: string; dica: string }) {
  return (
    <div style={{ ...card, display: "grid", gap: 2 }}>
      <span style={muted}>{titulo}</span>
      <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{valor}</strong>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{dica}</span>
    </div>
  );
}

/** Km por dia entre uma leitura e a seguinte (barra), linha tracejada = média, ⚡ = carregou nesse intervalo. */
function GraficoKm({ leituras, media }: { leituras: Leitura[]; media: number | null }) {
  const [ref, w] = useWidth<HTMLDivElement>(600);
  const barras: { at: string; km: number; dias: number; carga: boolean }[] = [];
  let carga = false;
  for (let i = 1; i < leituras.length; i++) {
    const a = leituras[i - 1], b = leituras[i];
    if (b.carga) carga = true;
    const km = b.odo - a.odo;
    if (km <= 0) continue;
    const dias = Math.max(1, Math.round((new Date(b.at).getTime() - new Date(a.at).getTime()) / 86_400_000));
    barras.push({ at: b.at, km, dias, carga });
    carga = false;
  }
  if (!barras.length) return null;

  const h = 180, top = 22, base = h - 24, left = 8;
  const porDia = (b: { km: number; dias: number }) => b.km / b.dias;
  const max = Math.max(...barras.map(porDia), media ?? 0) * 1.15;
  const passo = (w - left * 2) / barras.length;
  const bw = Math.min(36, passo * 0.6);
  const y = (v: number) => base - (v / max) * (base - top);

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>📈 Km por dia</h2>
        <span style={muted}>
          {media != null && <><span style={{ color: "var(--accent)" }}>- - -</span> média {n(media, 1)} km/dia (dias parados contam) · </>}⚡ carregou
        </span>
      </div>
      <div ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Km por dia entre leituras">
          {barras.map((b, i) => {
            const cx = left + passo * i + passo / 2;
            return (
              <g key={b.at}>
                <title>{`${dia(b.at)}: ${n(b.km)} km${b.dias > 1 ? ` em ${b.dias} dias` : ""}`}</title>
                <rect x={cx - bw / 2} y={y(porDia(b))} width={bw} height={base - y(porDia(b))} rx={4} fill="var(--accent)" opacity={b.dias > 1 ? 0.55 : 0.9} />
                <text x={cx} y={y(porDia(b)) - 6} textAnchor="middle" fontSize={11} fill="var(--text)">{n(porDia(b))}</text>
                <text x={cx} y={h - 8} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{b.carga ? "⚡" : ""}{passo < 46 ? dia(b.at).slice(0, 2) : dia(b.at)}</text>
              </g>
            );
          })}
          {media != null && <line x1={left} x2={w - left} y1={y(media)} y2={y(media)} stroke="var(--accent)" strokeDasharray="5 4" opacity={0.8} />}
          <line x1={left} x2={w - left} y1={base} y2={base} stroke="var(--border)" />
        </svg>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>Barra mais clara = média de mais de um dia (o ODO não foi mandado no meio). Toque na barra para ver o total.</div>
    </div>
  );
}
