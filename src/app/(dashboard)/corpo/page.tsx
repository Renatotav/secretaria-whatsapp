"use client";

import { useEffect, useState } from "react";
import { useWidth } from "@/lib/use-width";
import { brl } from "@/lib/format";

type Semana = { inicio: string; besteira: number; delivery: number; academia: number; peso: number | null };
type Dados = { pesos: { at: string; value: number }[]; meta: number | null; academia7: number; semanas: Semana[] };

const n = (v: number, d = 0) => v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
const TZ = { timeZone: "America/Sao_Paulo" } as const;
const dia = (s: string) => new Date(s).toLocaleDateString("pt-BR", { ...TZ, day: "2-digit", month: "2-digit" });
const card: React.CSSProperties = { background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 };
const muted: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)" };

/**
 * Corpo (pedido dele, 24/11/2026): peso e meta, dias de academia e quanto foi para
 * besteira/bebida e delivery por semana (das notas e lançamentos). Tudo chega pelo WhatsApp.
 */
export default function CorpoPage() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    fetch("/api/corpo")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setD)
      .catch(() => setErro(true));
  }, []);

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{ padding: 20, maxWidth: 1100, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>💪 Corpo</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            No WhatsApp: <em>peso 108,5</em> · <em>fui na academia</em> · <em>meta de peso 95</em> · <em>como está meu peso?</em>
          </p>
        </div>
        {erro && <div style={{ color: "var(--danger)" }}>Não consegui carregar. Atualize a página.</div>}
        {!d && !erro && <div style={{ color: "var(--text-muted)" }}>Carregando...</div>}
        {d && <Painel d={d} />}
      </div>
    </div>
  );
}

function Painel({ d }: { d: Dados }) {
  const ult = d.pesos.at(-1);
  const primeiro = d.pesos[0];
  const falta = ult && d.meta != null ? ult.value - d.meta : null;
  const comidaSemana = d.semanas.at(-1);
  const anteriores = d.semanas.slice(0, -1).filter((s) => s.besteira + s.delivery > 0);
  const mediaComida = anteriores.length ? anteriores.reduce((t, s) => t + s.besteira + s.delivery, 0) / anteriores.length : null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(150px, 100%), 1fr))", gap: 10 }}>
        <Kpi titulo="Peso" valor={ult ? `${n(ult.value, 1)} kg` : "—"} dica={ult ? `em ${dia(ult.at)}` : "mande: peso 108,5"} />
        <Kpi titulo="Desde o começo" valor={ult && primeiro && d.pesos.length > 1 ? `${ult.value - primeiro.value > 0 ? "+" : ""}${n(ult.value - primeiro.value, 1)} kg` : "—"} dica={primeiro ? `desde ${dia(primeiro.at)}` : ""} />
        <Kpi titulo="Meta" valor={d.meta != null ? `${n(d.meta, 1)} kg` : "—"} dica={falta == null ? "mande: meta de peso 95" : falta > 0 ? `faltam ${n(falta, 1)} kg` : "🏆 alcançada"} />
        <Kpi titulo="Academia" valor={`${d.academia7} dia(s)`} dica="nos últimos 7 dias" />
        <Kpi titulo="Besteira e delivery" valor={comidaSemana ? brl(comidaSemana.besteira + comidaSemana.delivery) : "—"} dica={mediaComida != null ? `esta semana · média ${brl(mediaComida)}` : "esta semana"} />
      </div>
      <GraficoPeso pesos={d.pesos} meta={d.meta} />
      <GraficoSemanas semanas={d.semanas} />
    </>
  );
}

function Kpi({ titulo, valor, dica }: { titulo: string; valor: string; dica: string }) {
  return (
    <div style={{ ...card, display: "grid", gap: 2 }}>
      <span style={muted}>{titulo}</span>
      <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{valor}</strong>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{dica}</span>
    </div>
  );
}

/** Linha do peso, com a meta tracejada. */
function GraficoPeso({ pesos, meta }: { pesos: Dados["pesos"]; meta: number | null }) {
  const [ref, w] = useWidth<HTMLDivElement>(640);
  if (pesos.length < 2) {
    return <div style={{ ...card, ...muted, fontSize: 13 }}>📈 O gráfico do peso aparece a partir do 2º registro. Dica: pese-se sempre no mesmo horário (de manhã, em jejum).</div>;
  }
  const h = 220, left = 40, right = 12, top = 16, base = h - 26;
  const vals = [...pesos.map((p) => p.value), ...(meta != null ? [meta] : [])];
  const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1);
  const t0 = new Date(pesos[0].at).getTime(), t1 = new Date(pesos.at(-1)!.at).getTime();
  const x = (s: string) => left + ((new Date(s).getTime() - t0) / Math.max(1, t1 - t0)) * (w - left - right);
  const y = (v: number) => top + ((max - v) / (max - min)) * (base - top);
  const linha = pesos.map((p) => `${x(p.at)},${y(p.value)}`).join(" ");
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>📈 Peso</h2>
        {meta != null && <span style={muted}><span style={{ color: "var(--success)" }}>- - -</span> meta {n(meta, 1)} kg</span>}
      </div>
      <div ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Peso ao longo do tempo">
          {[min, (min + max) / 2, max].map((v) => (
            <g key={v}>
              <line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke="var(--border)" opacity={0.6} />
              <text x={left - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--text-muted)">{n(v)}</text>
            </g>
          ))}
          {meta != null && <line x1={left} x2={w - right} y1={y(meta)} y2={y(meta)} stroke="var(--success)" strokeDasharray="5 4" />}
          <polyline points={linha} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
          {pesos.map((p) => <circle key={p.at} cx={x(p.at)} cy={y(p.value)} r={3.5} fill="var(--accent)" />)}
          <text x={left} y={h - 6} fontSize={10} fill="var(--text-muted)">{dia(pesos[0].at)}</text>
          <text x={w - right} y={h - 6} textAnchor="end" fontSize={10} fill="var(--text-muted)">{dia(pesos.at(-1)!.at)}</text>
        </svg>
      </div>
    </div>
  );
}

/** Por semana: dias de academia e R$ de besteira/bebida e delivery. */
function GraficoSemanas({ semanas }: { semanas: Semana[] }) {
  const [ref, w] = useWidth<HTMLDivElement>(640);
  const [sel, setSel] = useState<number | null>(null);
  const h = 200, left = 8, base = h - 24, top = 18;
  const passo = (w - left * 2) / semanas.length;
  const bw = Math.min(30, passo * 0.6);
  const maxR = Math.max(1, ...semanas.map((s) => s.besteira + s.delivery));
  const yR = (v: number) => base - (v / maxR) * (base - top);
  const atual = sel != null ? semanas[sel] : null;
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>🍔 Semanas: besteira, delivery e academia</h2>
        <span style={muted}>
          <span style={{ color: "var(--warning)" }}>■</span> besteira e bebida · <span style={{ color: "var(--accent)" }}>■</span> delivery · 🏋️ dias de academia
        </span>
      </div>
      <div ref={ref}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Besteira, delivery e academia por semana">
          <line x1={left} x2={w - left} y1={base} y2={base} stroke="var(--border)" />
          {semanas.map((s, i) => {
            const cx = left + passo * i + passo / 2;
            const on = sel === i;
            return (
              <g key={s.inicio} onClick={() => setSel(on ? null : i)} style={{ cursor: "pointer" }}>
                <rect x={cx - passo / 2} y={0} width={passo} height={h} fill={on ? "var(--bg-hover)" : "transparent"} rx={6} />
                <rect x={cx - bw / 2} y={yR(s.besteira)} width={bw} height={base - yR(s.besteira)} rx={3} fill="var(--warning)" opacity={0.85} />
                <rect x={cx - bw / 2} y={yR(s.besteira + s.delivery)} width={bw} height={yR(s.besteira) - yR(s.besteira + s.delivery)} rx={3} fill="var(--accent)" opacity={0.85} />
                {s.academia > 0 && <text x={cx} y={yR(s.besteira + s.delivery) - 5} textAnchor="middle" fontSize={11} fill="var(--text)">🏋️{s.academia}</text>}
                <text x={cx} y={h - 6} textAnchor="middle" fontSize={10} fill={on ? "var(--text)" : "var(--text-muted)"}>{passo < 44 ? dia(s.inicio).slice(0, 2) : dia(s.inicio)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "var(--bg-hover)", fontSize: 13 }}>
        {atual ? (
          <>
            <strong>Semana de {dia(atual.inicio)}</strong>: besteira e bebida {brl(atual.besteira)} · delivery {brl(atual.delivery)} · academia {atual.academia} dia(s)
            {atual.peso != null && ` · peso médio ${n(atual.peso, 1)} kg`}
          </>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>Toque numa semana para ver os números. Os valores vêm das notas fiscais e dos lançamentos (pela data da compra).</span>
        )}
      </div>
    </div>
  );
}
